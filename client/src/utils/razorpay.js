/**
 * Utility to load Razorpay Checkout SDK and initiate payment transactions
 */

export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false);
      return;
    }
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const existingScript = document.getElementById('razorpay-checkout-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.id = 'razorpay-checkout-script';
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export const initiateRazorpayCheckout = async ({
  orderId,
  amount,
  currency = 'INR',
  keyId,
  planName = 'NotaryChain Pro',
  user = {},
  onSuccess,
  onDismiss,
  onError,
}) => {
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded || !window.Razorpay) {
    if (onError) onError(new Error('Razorpay SDK failed to load. Please check your internet connection.'));
    return;
  }

  const effectiveKeyId = keyId || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_TjiWqgGfepDnJp';

  const options = {
    key: effectiveKeyId,
    amount: amount,
    currency: currency,
    name: 'NotaryChain',
    description: `${planName} Subscription`,
    image: '/favicon.ico',
    order_id: orderId,
    handler: function (response) {
      if (onSuccess) {
        onSuccess({
          razorpay_order_id: response.razorpay_order_id,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
        });
      }
    },
    prefill: {
      name: user.name || '',
      email: user.email || '',
      contact: user.phone || '',
    },
    notes: {
      address: 'NotaryChain Headquarters',
      platform: 'NotaryChain Web App'
    },
    theme: {
      color: '#2D6A4F', // Brand green
    },
    modal: {
      ondismiss: function () {
        if (onDismiss) onDismiss();
      },
      escape: true,
      backdropclose: false
    },
  };

  try {
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response) {
      if (onError) {
        onError({
          code: response.error?.code,
          description: response.error?.description,
          source: response.error?.source,
          step: response.error?.step,
          reason: response.error?.reason,
        });
      }
    });
    rzp.open();
  } catch (err) {
    if (onError) onError(err);
  }
};
