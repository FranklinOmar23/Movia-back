const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const adminController = require('../controllers/adminController');

router.post('/users', adminAuth, adminController.createUser);
router.get('/users', adminAuth, adminController.getUsers);
router.put('/users/:id', adminAuth, adminController.updateUser);

module.exports = router;