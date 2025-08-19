
const { uploadProductsByKinkLight } = require('./uploads/kinklightUpload');
const { uploadProductsByLightStar } = require('./uploads/lightStarUpload');
const { uploadProductsByWerkel } = require('./uploads/werkelUpload');
const { uploadProductsByArtelamp } = require('./uploads/artelampUpload');
const { uploadProductsByMaytoni } = require('./uploads/maytoniUpload');
const { uploadProductsByDenkirs } = require('./uploads/denkirsUpload');
const { uploadProductsByElektroStandard } = require('./uploads/elektroStandartUpload');
const { uploadProductsByStluce } = require('./uploads/stluceUpload');
const { uploadProductsByVoltum } = require('./uploads/voltumUplodas');
const { uploadProductsByFavouriteLight } = require('./uploads/favouriteLightUpload');
const { uploadProductsByLumion } = require('./uploads/lumionUpload');
const { uploadProductsByOdeon } = require('./uploads/odeonUploads');
const { uploadProductsBySonex } = require('./uploads/sonexUploads');
const { uploadProductsByNovotechLight } = require('./uploads/NovotechLightUploads');

function updateProductData(){
    uploadProductsByKinkLight();
    uploadProductsByStluce();
    uploadProductsByMaytoni();
    uploadProductsByArtelamp();
    uploadProductsByLightStar();
    uploadProductsByWerkel();
    uploadProductsByDenkirs();
    uploadProductsByElektroStandard();
    uploadProductsByVoltum();
    uploadProductsByFavouriteLight();
    uploadProductsByLumion();
    uploadProductsByOdeon();
    uploadProductsBySonex();
    uploadProductsByNovotechLight();
    console.log('Данные успешно обновлены!');
}

module.exports = { updateProductData };