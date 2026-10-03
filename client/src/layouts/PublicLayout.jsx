import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Sparkles } from 'lucide-react';
import Button from '../components/common/Button';
import { useAuth } from '../hooks/useAuth';

const PublicLayout = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const isPricingPage = location.pathname === '/pricing';
  const isLanding = location.pathname === '/';
  const isPriceComparison = location.pathname === '/price-comparison';
  const isVerifyHash = location.pathname === '/verify-hash';
  
  // Pages that render their own complete, customized navbars
  const hasCustomHeader = isLanding || isPriceComparison || isVerifyHash;

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile menu on route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col font-sans">
      {!hasCustomHeader && (
        <header className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'glass-dark bg-white/90 dark:bg-slate-950/90 shadow-sm border-b border-slate-200 dark:border-slate-800 py-2.5 sm:py-3' : 'bg-transparent py-3 sm:py-5'}`}>
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center font-bold text-white shadow-xs">N</div>
              <span className="font-display font-bold text-lg sm:text-xl text-slate-900 dark:text-white tracking-tight">NotaryChain</span>
            </Link>
            
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600 dark:text-slate-300">
              <a href="/#features" className="hover:text-primary-500 transition-colors">Features</a>
              <a href="/#security" className="hover:text-primary-500 transition-colors">Security</a>
              <a href="/pricing" className="hover:text-primary-500 transition-colors">Pricing</a>
              <Link to="/price-comparison" className="hover:text-[#2D6A4F] dark:hover:text-emerald-400 font-bold text-[#2D6A4F] dark:text-emerald-400 transition-colors flex items-center gap-1">
                <span>AI Price Comparison</span>
              </Link>
            </nav>
            
            <div className="flex items-center gap-1.5 sm:gap-3">
              {isPricingPage ? (
                <Link to={isAuthenticated ? "/dashboard" : "/"}>
                  <Button variant="secondary" size="sm">
                    ← <span className="hidden xs:inline">Back to </span>{isAuthenticated ? "Dashboard" : "Home"}
                  </Button>
                </Link>
              ) : isAuthenticated ? (
                <Link to="/dashboard">
                  <Button variant="primary" size="sm">Dashboard</Button>
                </Link>
              ) : (
                <>
                  <Link to="/price-comparison" className="hidden sm:inline-flex">
                    <Button variant="secondary" size="sm">AI Price Comparison</Button>
                  </Link>
                  <Link to="/login"><Button variant="ghost" size="sm">Log In</Button></Link>
                  <Link to="/signup"><Button variant="primary" size="sm">Get Started</Button></Link>
                </>
              )}

              {/* Mobile hamburger menu button */}
              <button
                onClick={() => setMobileMenuOpen(prev => !prev)}
                className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center cursor-pointer"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Navigation Dropdown */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="md:hidden bg-white/98 dark:bg-slate-900/98 border-b border-slate-200 dark:border-slate-800 px-4 py-4 space-y-3 shadow-lg overflow-hidden backdrop-blur-md"
              >
                <div className="flex flex-col space-y-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                  <Link to="/#features" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] flex items-center">Features</Link>
                  <Link to="/#security" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] flex items-center">Security</Link>
                  <Link to="/pricing" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] flex items-center">Pricing</Link>
                  <Link to="/price-comparison" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[#2D6A4F] dark:text-emerald-400 font-bold min-h-[44px] flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#2D6A4F] dark:text-emerald-400" />
                    <span>AI Price Comparison</span>
                  </Link>
                  <Link to="/verify-hash" onClick={() => setMobileMenuOpen(false)} className="px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 min-h-[44px] flex items-center">Verify Hash</Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>
      )}
      
      <main className="flex-grow">
        <Outlet />
      </main>
      
      {!hasCustomHeader && (
        <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-8 sm:py-12 text-slate-500 dark:text-slate-400">
          <div className="max-w-7xl mx-auto px-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-3 sm:mb-4 opacity-50 grayscale">
              <span className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">NotaryChain</span>
            </div>
            <p className="text-xs sm:text-sm">© {new Date().getFullYear()} NotaryChain Inc. All rights reserved.</p>
          </div>
        </footer>
      )}
    </div>
  );
};

export default PublicLayout;
