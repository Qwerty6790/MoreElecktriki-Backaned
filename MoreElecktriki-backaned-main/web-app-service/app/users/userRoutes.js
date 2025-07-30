const express = require('express');
const userControllers = require('./userControllers'); 
const router = express.Router();

router.get('/users/:userId', userControllers.getUserById);

module.exports = router;
