const router = require('express').Router();
const paymentController = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.get('/config', paymentController.getConfig);

// Protected payment endpoints
router.use(protect);
router.post('/create-order', paymentController.createOrder);
router.post('/verify-payment', paymentController.verifyPayment);

module.exports = router;
