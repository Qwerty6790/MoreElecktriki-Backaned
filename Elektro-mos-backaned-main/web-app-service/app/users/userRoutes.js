const express = require('express');
const userControllers = require('./userControllers'); 
const { cacheMiddlewares } = require('../../middleware/cacheMiddleware');
const router = express.Router();

router.get('/users/:userId', cacheMiddlewares.users, userControllers.getUserById);

module.exports = router;
