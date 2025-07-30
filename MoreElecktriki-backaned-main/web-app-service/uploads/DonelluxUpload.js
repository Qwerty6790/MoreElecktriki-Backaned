const mongoose = require('mongoose');
const axios = require('axios');
const xml2js = require('xml2js');
const { ProductModel } = require('../app/products/productModel');

async function connectToDatabase() {
  const mongoURI = 'mongodb+srv://Elecktro-mos:j13hvAQNBpEVEqdo@elecktro-mos.o6boe.mongodb.net/Elecktro-mos?retryWrites=true&w=majority&appName=Elecktro-mos';
  try {
    await mongoose.connect(mongoURI); // без deprecated-опций
    console.log('✔ Подключено к MongoDB');
  } catch (err) {
    console.error('✖ Ошибка подключения к MongoDB:', err.message);
    process.exit(1);
  }
}

function getParamValue(params = [], name) {
  const p = params.find(x => x.$?.name === name);
  if (!p) return '';
  // может быть либо text внутри p._, либо в атрибуте value
  return (p._ || p.$.value || '').trim();
}

function getImages(offer) {
  if (offer.picture) {
    return offer.picture.map(u => u.trim());
  }
  // fallback: искать <param name="Фото на сайте">
  return (offer.param || [])
    .filter(p => p.$.name === 'Фото на сайте')
    .map(p => p.$.value.trim());
}

async function fetchXML(url) {
  const resp = await axios.get(url, { responseType: 'text' });
  return xml2js.parseStringPromise(resp.data, { explicitArray: true, trim: true });
}

async function uploadProductsDonel() {
  await connectToDatabase();

  const url = 'https://www.donolux.ru/include/uyml.php';
  const parsed = await fetchXML(url);

  // Находим корневой узел (yml_catalog, data, и т.п.)
  const rootKey = Object.keys(parsed)[0];
  const root = parsed[rootKey];

  // Пытаемся найти offers
  const offers = (
    root.shop?.[0]
      ? root.shop[0].offers?.[0]?.offer
      : root.catalog?.[0]?.items?.[0]?.item
  ) || [];

  for (const o of offers) {
    const id      = o.$.id || '';
    const article = getParamValue(o.param, 'Артикул');
    const name    = o.name?.[0]
                  || o.typePrefix?.[0]
                  || [o.vendor?.[0], o.model?.[0]].filter(Boolean).join(' ');
    const price   = parseFloat(o.price?.[0] || 0);
    const stock   = 100;
    const images  = getImages(o);

    if (!name || !article) {
      console.warn(`⚠ Пропуск оффера ID=${id} — нет названия или артикула`);
      continue;
    }

    const productData = {
      article,
      code: id,
      name,
      price,
      stock,
      imageAddress: images,
      source: 'DonelluxProduct',
    };

    try {
      await ProductModel.findOneAndUpdate(
        { article },
        productData,
        { upsert: true, new: true }
      );
      console.log(`✔ [${article}] ${name} сохранён/обновлён`);
    } catch (err) {
      console.error(`✖ Ошибка при сохранении ${name}:`, err);
    }
  }

  console.log('✅ Все товары обработаны.');
  await mongoose.disconnect();
}

uploadProductsDonel()
  .catch(err => console.error(err));
