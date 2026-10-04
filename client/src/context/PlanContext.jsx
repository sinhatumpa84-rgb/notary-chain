import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { PLANS } from '../utils/planConfig';
import { useAuth } from '../hooks/useAuth';
import api from '../api/axios';
import { initiateRazorpayCheckout } from '../utils/razorpay';

const PlanContext = createContext(null);

function getUserStorageKey(user) {
  const uId = user?._id || user?.id || user?.email || 'guest';
  return `notarychain_user_quota_${uId}`;
}

export function PlanProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  
  const [quotaData, setQuotaData] = useState({
    plan: 'FREE',
    verificationCount: 0,
    verificationLimit: 3,
    remaining: 3,
    isUnlimited: false,
    isAtLimit: false,
    canVerify: true,
    currentPeriodStart: new Date().toISOString(),
    currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });
  const [loading, setLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [hasDismissedModal, setHasDismissedModal] = useState(() => {
    try {
      const uId = user?._id || user?.id || user?.email || 'guest';
      return sessionStorage.getItem(`notarychain_limit_modal_dismissed_${uId}`) === 'true';
    } catch {
      return false;
    }
  });
  const shownForLimitRef = useRef(false);

  // Fetch authoritative quota from server for this specific user account
  const fetchQuota = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setQuotaData({
        plan: 'FREE',
        verificationCount: 0,
        verificationLimit: 3,
        remaining: 3,
        isUnlimited: false,
        isAtLimit: false,
        canVerify: true,
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      });
      return;
    }

    try {
      setLoading(true);
      const res = await api.get('/users/quota');
      const data = res.data?.data || res.data;
      if (data) {
        if ((data.plan || 'FREE') === 'FREE' && data.currentPeriodEnd) {
          const endMs = new Date(data.currentPeriodEnd).getTime();
          const maxMs = Date.now() + 24 * 60 * 60 * 1000;
          if (endMs > maxMs) {
            data.currentPeriodEnd = new Date(maxMs).toISOString();
          }
        }
        setQuotaData(data);
        // Cache locally strictly scoped by user ID
        localStorage.setItem(getUserStorageKey(user), JSON.stringify(data));
      }
    } catch (err) {
      // Fallback to user-scoped local cache
      const cached = localStorage.getItem(getUserStorageKey(user));
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if ((parsed.plan || 'FREE') === 'FREE' && parsed.currentPeriodEnd) {
            const endMs = new Date(parsed.currentPeriodEnd).getTime();
            const maxMs = Date.now() + 24 * 60 * 60 * 1000;
            if (endMs > maxMs) {
              parsed.currentPeriodEnd = new Date(maxMs).toISOString();
            }
          }
          setQuotaData(parsed);
        } catch {}
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user]);

  // When user changes (User A logs out, User B logs in), reload their specific quota
  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  // Real-time 24-hour rollover watcher: automatically reopens quota after 24 hours
  useEffect(() => {
    const checkRollover = () => {
      if (quotaData.currentPeriodEnd) {
        const diffMs = new Date(quotaData.currentPeriodEnd).getTime() - Date.now();
        if (diffMs <= 0) {
          // 24 hours have passed! Automatically reopen 3/3 verifications
          setQuotaData(prev => {
            const resetObj = {
              ...prev,
              verificationCount: 0,
              remaining: prev.isUnlimited ? 'Unlimited' : (prev.verificationLimit || 3),
              isAtLimit: false,
              canVerify: true,
              currentPeriodStart: new Date().toISOString(),
              currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            };
            if (user) {
              localStorage.setItem(getUserStorageKey(user), JSON.stringify(resetObj));
            }
            return resetObj;
          });
          // Sync with backend
          fetchQuota();
        }
      }
    };

    const interval = setInterval(checkRollover, 5000);
    return () => clearInterval(interval);
  }, [quotaData.currentPeriodEnd, user, fetchQuota]);

  const currentPlanKey = (quotaData.plan || 'FREE').toUpperCase();
  const currentPlan = PLANS[currentPlanKey] || PLANS.FREE;
  const verificationsUsed = quotaData.verificationCount || 0;
  const verificationsLimit = quotaData.verificationLimit ?? (currentPlanKey === 'FREE' ? 3 : -1);
  const isUnlimited = currentPlanKey !== 'FREE' || verificationsLimit === -1;
  const isAtLimit = !isUnlimited && verificationsUsed >= verificationsLimit;
  const usagePercentage = isUnlimited ? 0 : Math.min((verificationsUsed / verificationsLimit) * 100, 100);
  const remainingCount = isUnlimited ? 'Unlimited' : Math.max(0, verificationsLimit - verificationsUsed);

  // When user changes, reload their specific dismissed state
  useEffect(() => {
    try {
      const uId = user?._id || user?.id || user?.email || 'guest';
      const dismissed = sessionStorage.getItem(`notarychain_limit_modal_dismissed_${uId}`) === 'true';
      setHasDismissedModal(dismissed);
    } catch {
      setHasDismissedModal(false);
    }
  }, [user]);

  // Synchronize modal when free verification limit is reached
  useEffect(() => {
    if (isAtLimit) {
      if (!hasDismissedModal && !shownForLimitRef.current) {
        setShowUpgradeModal(true);
        shownForLimitRef.current = true;
      }
    } else {
      shownForLimitRef.current = false;
      setHasDismissedModal(false);
      try {
        const uId = user?._id || user?.id || user?.email || 'guest';
        sessionStorage.removeItem(`notarychain_limit_modal_dismissed_${uId}`);
      } catch {}
    }
  }, [isAtLimit, hasDismissedModal, user]);

  const openUpgradeModal = useCallback(() => {
    setShowUpgradeModal(true);
  }, []);

  const dismissUpgradeModal = useCallback(() => {
    setShowUpgradeModal(false);
    setHasDismissedModal(true);
    try {
      const uId = user?._id || user?.id || user?.email || 'guest';
      sessionStorage.setItem(`notarychain_limit_modal_dismissed_${uId}`, 'true');
    } catch {}
  }, [user]);

  const incrementUsage = useCallback(async () => {
    // Optimistic local update
    setQuotaData(prev => {
      const nextCount = prev.verificationCount + 1;
      const nextRemaining = prev.isUnlimited ? 'Unlimited' : Math.max(0, prev.verificationLimit - nextCount);
      const updated = {
        ...prev,
        verificationCount: nextCount,
        remaining: nextRemaining,
        isAtLimit: !prev.isUnlimited && nextCount >= prev.verificationLimit,
        canVerify: prev.isUnlimited || nextCount < prev.verificationLimit
      };
      if (user) {
        localStorage.setItem(getUserStorageKey(user), JSON.stringify(updated));
      }
      return updated;
    });
    // Sync with server
    await fetchQuota();
  }, [fetchQuota, user]);

  const canVerify = useCallback(() => {
    if (isUnlimited) return true;
    return verificationsUsed < verificationsLimit;
  }, [isUnlimited, verificationsUsed, verificationsLimit]);

  const upgradePlan = useCallback(async (planKey = 'PRO') => {
    const pKey = planKey.toUpperCase();
    try {
      const res = await api.post('/users/upgrade-plan', { plan: pKey });
      const data = res.data?.data || res.data;
      if (data) {
        setQuotaData(data);
        if (user) {
          localStorage.setItem(getUserStorageKey(user), JSON.stringify(data));
        }
      }
    } catch (err) {
      // Offline fallback for demo
      setQuotaData(prev => ({
        ...prev,
        plan: pKey,
        verificationLimit: pKey === 'FREE' ? 10 : -1,
        isUnlimited: pKey !== 'FREE',
        isAtLimit: false,
        canVerify: true,
        remaining: 'Unlimited'
      }));
    }
  }, [user]);

  const resetQuota = useCallback(async () => {
    shownForLimitRef.current = false;
    setHasDismissedModal(false);
    try {
      const uId = user?._id || user?.id || user?.email || 'guest';
      sessionStorage.removeItem(`notarychain_limit_modal_dismissed_${uId}`);
    } catch {}

    try {
      const res = await api.post('/users/reset-quota');
      const data = res.data?.data || res.data;
      if (data) {
        setQuotaData(data);
        if (user) {
          localStorage.setItem(getUserStorageKey(user), JSON.stringify(data));
        }
      }
    } catch (err) {
      setQuotaData(prev => {
        const resetObj = {
          ...prev,
          verificationCount: 0,
          remaining: prev.isUnlimited ? 'Unlimited' : (prev.verificationLimit || 3),
          isAtLimit: false,
          canVerify: true,
          currentPeriodStart: new Date().toISOString(),
          currentPeriodEnd: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        };
        if (user) {
          localStorage.setItem(getUserStorageKey(user), JSON.stringify(resetObj));
        }
        return resetObj;
      });
    }
  }, [user]);

  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  const processRazorpayPayment = useCallback(async ({ planKey = 'PRO', billingCycle = 'monthly' } = {}) => {
    if (!isAuthenticated) {
      toast.error('Please sign in to upgrade your subscription.');
      return false;
    }

    const pKey = planKey.toUpperCase();
    if (pKey === 'FREE') {
      toast('You are on the Free plan');
      return true;
    }

    setIsProcessingPayment(true);
    const loadingToastId = toast.loading('Initializing Razorpay checkout...');

    try {
      // 1. Create order on backend
      const orderRes = await api.post('/payments/create-order', {
        plan: pKey,
        billingCycle
      });

      const orderData = orderRes.data?.data || orderRes.data;
      if (!orderData || !orderData.orderId) {
        throw new Error(orderRes.data?.message || 'Failed to create order');
      }

      toast.dismiss(loadingToastId);

      // 2. Open Razorpay Checkout modal
      return new Promise((resolve) => {
        initiateRazorpayCheckout({
          orderId: orderData.orderId,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          keyId: orderData.keyId,
          planName: orderData.planName || `NotaryChain ${pKey}`,
          user: orderData.user || {
            name: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email,
            email: user?.email,
            phone: user?.phone || ''
          },
          onSuccess: async (paymentDetails) => {
            const verifyToastId = toast.loading('Verifying payment signature with NotaryChain...');
            try {
              const verifyRes = await api.post('/payments/verify-payment', {
                razorpay_order_id: paymentDetails.razorpay_order_id,
                razorpay_payment_id: paymentDetails.razorpay_payment_id,
                razorpay_signature: paymentDetails.razorpay_signature,
                plan: pKey,
                billingCycle
              });

              const verifiedData = verifyRes.data?.data || verifyRes.data;
              if (verifiedData?.quota) {
                setQuotaData(verifiedData.quota);
                if (user) {
                  localStorage.setItem(getUserStorageKey(user), JSON.stringify(verifiedData.quota));
                }
              }

              toast.dismiss(verifyToastId);
              toast.success(`🎉 Payment verified! Upgraded to NotaryChain ${pKey}!`, { duration: 5000 });
              setShowUpgradeModal(false);
              resolve(true);
            } catch (err) {
              toast.dismiss(verifyToastId);
              toast.error(err.response?.data?.message || 'Payment verification failed. Please contact support.');
              resolve(false);
            } finally {
              setIsProcessingPayment(false);
            }
          },
          onDismiss: () => {
            setIsProcessingPayment(false);
            toast('Payment checkout cancelled', { icon: 'ℹ️' });
            resolve(false);
          },
          onError: (err) => {
            setIsProcessingPayment(false);
            toast.error(err.description || err.message || 'Payment processing error');
            resolve(false);
          }
        });
      });
    } catch (err) {
      toast.dismiss(loadingToastId);
      setIsProcessingPayment(false);
      const errMsg = err.response?.data?.message || err.message || 'Failed to initialize checkout';
      toast.error(errMsg);
      return false;
    }
  }, [isAuthenticated, user]);

  const value = {
    currentPlan,
    currentPlanKey,
    verificationsUsed,
    verificationsLimit,
    remainingCount,
    isUnlimited,
    isAtLimit,
    canVerify,
    usagePercentage,
    resetDate: quotaData.currentPeriodEnd,
    incrementUsage,
    upgradePlan,
    resetQuota,
    fetchQuota,
    loading,
    showUpgradeModal,
    setShowUpgradeModal,
    openUpgradeModal,
    dismissUpgradeModal,
    hasDismissedModal,
    processRazorpayPayment,
    isProcessingPayment
  };

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const context = useContext(PlanContext);
  if (!context) {
    throw new Error('usePlan must be used within a PlanProvider');
  }
  return context;
}

export default PlanContext;
