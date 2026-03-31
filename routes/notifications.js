const express = require('express');
const router  = express.Router();
const nc      = require('../controllers/miscControllers');
const { authenticate } = require('../middleware/auth');

router.get('/',                 authenticate, nc.getMyNotifications);
router.patch('/read-all',       authenticate, nc.markAllRead);
router.patch('/:id/read',       authenticate, nc.markRead);

module.exports = router;
