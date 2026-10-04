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
  const razorpayKeyId = (import.meta.env.VITE_RAZORPAY_KEY_ID || keyId || '').trim();

  if (!razorpayKeyId) {
    const missingKeyError = new Error('Razorpay is not configured. Please add VITE_RAZORPAY_KEY_ID to your frontend environment.');
    if (onError) onError(missingKeyError);
    return;
  }

  const isLoaded = await loadRazorpayScript();
  if (!isLoaded || !window.Razorpay) {
    const sdkError = new Error('Razorpay SDK failed to load. Please check your internet connection.');
    if (onError) onError(sdkError);
    return;
  }

  const options = {
    key: razorpayKeyId,
    amount: amount,
    currency: currency,
    name: 'NotaryChain',
    description: `${planName} Subscription`,
    image: '/favicon.ico',
    order_id: orderId,
    handler: function (response) {
      cleanupCornerCleaner();
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
        cleanupCornerCleaner();
        if (onDismiss) onDismiss();
      },
      escape: true,
      backdropclose: false
    },
  };

  try {
    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', function (response) {
      cleanupCornerCleaner();
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

    // TEMPORARY: Clean up presentation framing and corner area during Test Mode checkout
    applyCornerCleaner();

    rzp.open();
  } catch (err) {
    cleanupCornerCleaner();
    if (onError) onError(err);
  }
};

const CORNER_CLEANER_ID = 'razorpay-corner-cleaner';

const applyCornerCleaner = () => {
  if (typeof document === 'undefined') return;
  document.body.classList.add('razorpayTestModeWrapper');

  const ensureCover = () => {
    let cover = document.getElementById(CORNER_CLEANER_ID);
    if (!cover) {
      cover = document.createElement('div');
      cover.id = CORNER_CLEANER_ID;
      cover.setAttribute('aria-hidden', 'true');
      cover.style.cssText = [
        'position: fixed !important',
        'top: 0 !important',
        'right: 0 !important',
        'width: 220px !important',
        'height: 220px !important',
        'z-index: 2147483647 !important',
        'background: #000000 !important',
        'clip-path: polygon(100% 0, 0 0, 100% 100%) !important',
        'pointer-events: none !important',
        'transition: opacity 0.2s ease !important'
      ].join(';');
      document.body.appendChild(cover);
    } else {
      document.body.appendChild(cover);
    }
  };

  ensureCover();
  setTimeout(ensureCover, 150);
  setTimeout(ensureCover, 500);
  setTimeout(ensureCover, 1200);
};

const cleanupCornerCleaner = () => {
  if (typeof document === 'undefined') return;
  document.body.classList.remove('razorpayTestModeWrapper');
  const cover = document.getElementById(CORNER_CLEANER_ID);
  if (cover) {
    cover.remove();
  }
};
