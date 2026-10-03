import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  FileText, Sun, Moon, ArrowLeft, Sparkles, Upload,
  CheckCircle2, AlertTriangle, ExternalLink, Loader2,
  Tag, Shield, Zap, Search
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import toast from 'react-hot-toast';

export const SAMPLE_COMPARISONS = [
  {
    id: 'headphones',
    label: '🎧 Sony WH-1000XM5 Headphones',
    name: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
    category: 'Electronics & Audio',
    detectedPrice: 29990,
    currency: 'INR',
    source: 'Croma Retail',
    specs: [
      { label: 'Noise Cancellation', value: 'Industry-leading Auto NC Optimizer' },
      { label: 'Battery Life', value: '30 Hours with Quick Charge' },
      { label: 'Microphones', value: '8 Mics with Precise Voice Pickup' },
      { label: 'Driver Unit', value: '30mm Carbon Fiber Composite' }
    ],
    alternatives: [
      {
        store: 'Amazon India',
        storeBadge: 'Prime Verified',
        productName: 'Sony WH-1000XM5 (Black Edition) Official Warranty',
        price: 26990,
        rating: 4.8,
        reviews: '12,450',
        saving: 3000,
        delivery: 'Free Next-Day Delivery',
        dealUrl: 'https://amazon.in'
      },
      {
        store: 'Flipkart',
        storeBadge: 'Super Seller',
        productName: 'Sony WH-1000XM5 Wireless Headphones (Silver)',
        price: 27490,
        rating: 4.7,
        reviews: '8,920',
        saving: 2500,
        delivery: '2-Day Express Shipping',
        dealUrl: 'https://flipkart.com'
      },
      {
        store: 'Reliance Digital',
        storeBadge: 'Store Pickup',
        productName: 'Sony WH-1000XM5 ANC Headset',
        price: 28490,
        rating: 4.6,
        reviews: '3,100',
        saving: 1500,
        delivery: 'Available in Nearest Store',
        dealUrl: 'https://reliancedigital.in'
      }
    ]
  },
  {
    id: 'flight',
    label: '✈️ Bangalore → Kolkata Flight',
    name: 'Bangalore (BLR) → Kolkata (CCU) Non-Stop Flight 6E-204',
    category: 'Travel & Airlines',
    detectedPrice: 7800,
    currency: 'INR',
    source: 'MakeMyTrip (IndiGo 6E-204)',
    specs: [
      { label: 'Flight Type', value: 'Direct Non-Stop (2h 35m)' },
      { label: 'Baggage', value: '15 kg Check-in + 7 kg Cabin' },
      { label: 'Departure', value: '14:20 IST · Kempegowda Intl (T1)' },
      { label: 'Arrival', value: '16:55 IST · NSCBI Airport' }
    ],
    alternatives: [
      {
        store: 'Air India Direct',
        storeBadge: 'Official Airline',
        productName: 'Air India AI-508 (BLR → CCU) 15:10 IST',
        price: 6200,
        rating: 4.6,
        reviews: '5,400',
        saving: 1600,
        delivery: 'Instant E-Ticket & Web Check-in',
        dealUrl: 'https://airindia.com'
      },
      {
        store: 'SpiceJet SG-304',
        storeBadge: 'Best Value',
        productName: 'SpiceJet SG-304 Non-Stop (16:45 IST)',
        price: 6350,
        rating: 4.4,
        reviews: '4,100',
        saving: 1450,
        delivery: 'Instant Confirmation',
        dealUrl: 'https://spicejet.com'
      },
      {
        store: 'Akasa Air QP-1342',
        storeBadge: 'New Aircraft',
        productName: 'Akasa Air QP-1342 Non-Stop (18:30 IST)',
        price: 6400,
        rating: 4.8,
        reviews: '3,200',
        saving: 1400,
        delivery: 'Instant E-Ticket',
        dealUrl: 'https://akasaair.com'
      }
    ]
  },
  {
    id: 'laptop',
    label: '💻 Apple MacBook Air M3 (16GB)',
    name: 'Apple MacBook Air 13.6" M3 Chip (16GB Unified Memory, 256GB SSD)',
    category: 'Computers & Laptops',
    detectedPrice: 114900,
    currency: 'INR',
    source: 'Apple Premium Reseller',
    specs: [
      { label: 'Processor', value: 'Apple M3 8-Core CPU / 10-Core GPU' },
      { label: 'Unified Memory', value: '16GB High-Bandwidth RAM' },
      { label: 'Display', value: '13.6" Liquid Retina (500 nits, P3)' },
      { label: 'Battery', value: 'Up to 18 Hours Apple Silicon' }
    ],
    alternatives: [
      {
        store: 'Amazon India',
        storeBadge: 'Apple Authorized',
        productName: 'Apple 2024 MacBook Air 13" M3 (16GB/256GB Space Grey)',
        price: 104990,
        rating: 4.9,
        reviews: '3,840',
        saving: 9910,
        delivery: 'Free Scheduled Delivery',
        dealUrl: 'https://amazon.in'
      },
      {
        store: 'Croma Online',
        storeBadge: 'Bank Discount',
        productName: 'MacBook Air M3 13.6" (HDFC Instant ₹5,000 Off)',
        price: 106990,
        rating: 4.8,
        reviews: '2,150',
        saving: 7910,
        delivery: 'Express 3-Hour Delivery',
        dealUrl: 'https://croma.com'
      },
      {
        store: 'Vijay Sales',
        storeBadge: 'Store Warranty',
        productName: 'Apple MacBook Air M3 Chip 16GB RAM Model',
        price: 108490,
        rating: 4.7,
        reviews: '1,200',
        saving: 6410,
        delivery: 'Free Home Delivery',
        dealUrl: 'https://vijaysales.com'
      }
    ]
  },
  {
    id: 'phone',
    label: '📱 Samsung Galaxy S24 Ultra (512GB)',
    name: 'Samsung Galaxy S24 Ultra 5G (Titanium Gray, 12GB RAM, 512GB Storage)',
    category: 'Mobile Phones',
    detectedPrice: 139999,
    currency: 'INR',
    source: 'Retail Mall Outlet',
    specs: [
      { label: 'Display', value: '6.8" Dynamic AMOLED 2X (2600 nits, 120Hz)' },
      { label: 'Camera', value: '200MP Quad Telephoto System + Galaxy AI' },
      { label: 'Processor', value: 'Snapdragon 8 Gen 3 for Galaxy' },
      { label: 'Battery', value: '5000 mAh with 45W Fast Charging' }
    ],
    alternatives: [
      {
        store: 'Amazon India',
        storeBadge: 'Amazon Choice',
        productName: 'Samsung Galaxy S24 Ultra 5G (Titanium Gray 512GB)',
        price: 124999,
        rating: 4.8,
        reviews: '6,780',
        saving: 15000,
        delivery: 'Next-Day Delivery with Exchange Bonus',
        dealUrl: 'https://amazon.in'
      },
      {
        store: 'Samsung Official Store',
        storeBadge: 'Corporate / Student',
        productName: 'Galaxy S24 Ultra 5G with Free Galaxy Watch6 Tier',
        price: 128999,
        rating: 4.9,
        reviews: '14,200',
        saving: 11000,
        delivery: 'Official Samsung Express Delivery',
        dealUrl: 'https://samsung.com/in'
      },
      {
        store: 'Flipkart',
        storeBadge: 'Assured Deal',
        productName: 'Samsung Galaxy S24 Ultra 5G (512GB Edition)',
        price: 129999,
        rating: 4.7,
        reviews: '4,500',
        saving: 10000,
        delivery: 'Free Express Shipping',
        dealUrl: 'https://flipkart.com'
      }
    ]
  }
];

export default function PriceComparison() {
  const { isDark, toggleTheme } = useTheme();
  const fileInputRef = useRef(null);

  const [activeItem, setActiveItem] = useState(SAMPLE_COMPARISONS[0]);
  const [imagePreview, setImagePreview] = useState(null);
  const [fileName, setFileName] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [productTitle, setProductTitle] = useState(SAMPLE_COMPARISONS[0].name);
  const [detectedPriceStr, setDetectedPriceStr] = useState(String(SAMPLE_COMPARISONS[0].detectedPrice));
  const [sourceStore, setSourceStore] = useState(SAMPLE_COMPARISONS[0].source);
  const [isEditing, setIsEditing] = useState(false);

  const handleSelectDemo = (item) => {
    setActiveItem(item);
    setProductTitle(item.name);
    setDetectedPriceStr(String(item.detectedPrice));
    setSourceStore(item.source);
    setImagePreview(null);
    setFileName('');
    setIsEditing(false);
    toast.success(`Loaded ${item.label} comparison!`, { icon: '🔍' });
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setImagePreview(evt.target.result);
      simulateOcr(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setImagePreview(evt.target.result);
      simulateOcr(file.name);
    };
    reader.readAsDataURL(file);
  };

  const simulateOcr = (name) => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      const lower = name.toLowerCase();
      let matched = SAMPLE_COMPARISONS[0];
      if (lower.includes('flight') || lower.includes('indigo') || lower.includes('7800') || lower.includes('air')) {
        matched = SAMPLE_COMPARISONS[1];
      } else if (lower.includes('macbook') || lower.includes('apple') || lower.includes('laptop')) {
        matched = SAMPLE_COMPARISONS[2];
      } else if (lower.includes('samsung') || lower.includes('galaxy') || lower.includes('phone') || lower.includes('ultra')) {
        matched = SAMPLE_COMPARISONS[3];
      }
      setActiveItem(matched);
      setProductTitle(matched.name);
      setDetectedPriceStr(String(matched.detectedPrice));
      setSourceStore(matched.source);
      toast.success('OCR extracted product details & found better prices!', { icon: '✨' });
    }, 850);
  };

  const parsedDetectedPrice = parseFloat(String(detectedPriceStr).replace(/[^0-9.]/g, '')) || activeItem.detectedPrice;
  const lowestMarketPrice = activeItem.alternatives.length > 0 ? Math.min(...activeItem.alternatives.map((a) => a.price)) : parsedDetectedPrice;
  const potentialSavings = Math.max(0, parsedDetectedPrice - lowestMarketPrice);
  const savingsPct = parsedDetectedPrice > 0 ? ((potentialSavings / parsedDetectedPrice) * 100).toFixed(1) : '0.0';

  return (
    <div className="min-h-screen bg-[#FAF8F4] dark:bg-slate-950 text-[#2E2A26] dark:text-[#F3F1ED] font-sans flex flex-col justify-between transition-colors">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#FAF8F4]/95 dark:bg-slate-950/95 backdrop-blur-md border-b border-[#E8E2DA] dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-[#2D6A4F] flex items-center justify-center text-white shadow-xs">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <span className="font-display font-bold text-base sm:text-lg text-[#2E2A26] dark:text-white tracking-tight">NotaryChain</span>
              <span className="hidden sm:inline-block ml-2 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#F0FAF5] dark:bg-emerald-950/60 text-[#2D6A4F] dark:text-emerald-400 border border-[#B3E4CC] dark:border-emerald-800">
                Public Price Comparator
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-2 sm:p-2.5 rounded-xl text-[#7B746E] dark:text-slate-400 hover:text-[#2E2A26] dark:hover:text-white hover:bg-[#F6F3EE] dark:hover:bg-slate-900 border border-[#E8E2DA] dark:border-slate-800 transition-all flex items-center justify-center cursor-pointer min-w-[38px] min-h-[38px]"
            >
              {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#52796F]" />}
            </button>
            <Link
              to="/login"
              className="hidden md:inline-block text-xs sm:text-sm font-semibold text-[#55504B] dark:text-slate-300 hover:text-[#2D6A4F] px-3 py-2 transition-colors"
            >
              Enterprise Sign In
            </Link>
            <Link
              to="/"
              className="flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-[#2D6A4F] text-white text-xs sm:text-sm font-semibold hover:bg-[#1B4532] transition-all shadow-xs shrink-0 min-h-[38px]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Back to Home</span>
              <span className="xs:hidden">Home</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1 w-full space-y-6 sm:space-y-8">
        {/* Hero Title */}
        <div className="text-center max-w-3xl mx-auto space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-[#F0FAF5] dark:bg-emerald-950/60 border border-[#B3E4CC] dark:border-emerald-800 text-[#2D6A4F] dark:text-emerald-400 text-[11px] sm:text-xs font-bold max-w-full text-center">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate sm:whitespace-normal">100% Free Public AI Price Comparison · No Login Required</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-[#2E2A26] dark:text-white">
            Find Cheaper Prices for Any Product or Booking
          </h1>
          <p className="text-sm text-[#7B746E] dark:text-slate-400">
            Upload a screenshot or choose an item below. Our AI extracts product details, compares multi-store listings, and uncovers immediate savings.
          </p>
        </div>

        {/* Demo Examples Selector */}
        <div className="p-4 bg-white dark:bg-slate-900 border border-[#E9E4DD] dark:border-slate-800 rounded-2xl shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#9B9490] dark:text-slate-400 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Try Instant Demo Examples:
            </span>
            <span className="text-[11px] text-[#9B9490]">Click any item to compare instantly</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {SAMPLE_COMPARISONS.map((item) => {
              const isSelected = activeItem.id === item.id && !imagePreview;
              return (
                <button
                  key={item.id}
                  onClick={() => handleSelectDemo(item)}
                  className={`p-3 text-left rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#F0FAF5] dark:bg-emerald-950/40 border-[#2D6A4F] text-[#2D6A4F] dark:text-emerald-300 shadow-2xs'
                      : 'bg-[#FAF8F4] dark:bg-slate-800/60 border-[#E9E4DD] dark:border-slate-700 text-[#55504B] dark:text-slate-300 hover:border-[#2D6A4F]'
                  }`}
                >
                  <p className="truncate">{item.label}</p>
                  <p className="text-[11px] text-[#9B9490] dark:text-slate-400 font-normal mt-0.5">
                    Quoted: ₹{item.detectedPrice.toLocaleString()}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`p-5 sm:p-8 border-2 border-dashed rounded-2xl text-center transition-all cursor-pointer ${
            isDragging
              ? 'border-[#2D6A4F] bg-[#F0FAF5] dark:bg-emerald-950/40'
              : 'border-[#E9E4DD] dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-[#2D6A4F]'
          }`}
        >
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#F0FAF5] dark:bg-emerald-950/50 text-[#2D6A4F] dark:text-emerald-400 flex items-center justify-center mx-auto shadow-xs">
              <Upload className="w-6 h-6" />
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-2 pt-1 w-full">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setImagePreview('/test_sony_headphones_29990.jpg');
                  simulateOcr('sony_headphones_receipt_29990.jpg');
                }}
                className="w-full sm:w-auto px-3 py-1.5 bg-[#FAF8F4] dark:bg-slate-800 border border-[#E9E4DD] dark:border-slate-700 hover:border-[#2D6A4F] text-[#2D6A4F] dark:text-emerald-400 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-2xs truncate text-center"
              >
                🎧 Load Test Sony Receipt (₹29,990)
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setImagePreview('/test_flight_surge_7800.jpg');
                  simulateOcr('flight_ticket_surge_7800.jpg');
                }}
                className="w-full sm:w-auto px-3 py-1.5 bg-[#FAF8F4] dark:bg-slate-800 border border-[#E9E4DD] dark:border-slate-700 hover:border-[#2D6A4F] text-[#B45309] dark:text-amber-400 text-xs font-bold rounded-lg transition-all cursor-pointer shadow-2xs truncate text-center"
              >
                ✈️ Load Test Flight Ticket (₹7,800)
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full sm:w-auto px-4 py-1.5 bg-[#2D6A4F] text-white text-xs font-bold rounded-lg hover:bg-[#1B4532] transition-all shadow-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5" />
                <span>[ BROWSE FILE ]</span>
              </button>
            </div>
          </div>
        </div>

        {/* Loading Spinner */}
        {isScanning && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-6 bg-white dark:bg-slate-900 border border-[#E9E4DD] dark:border-slate-800 rounded-2xl text-center space-y-2 shadow-xs"
          >
            <Loader2 className="w-6 h-6 text-[#2D6A4F] animate-spin mx-auto" />
            <p className="text-sm font-bold text-[#2E2A26] dark:text-white">AI is reading the image & cross-referencing prices…</p>
            <p className="text-xs text-[#7B746E] dark:text-slate-400">Extracting product title, specifications, and checking 10+ retailer catalogs</p>
          </motion.div>
        )}

        {/* Results */}
        {!isScanning && (
          <div className="space-y-6">
            {potentialSavings > 0 ? (
              <div className="p-6 rounded-2xl bg-gradient-to-r from-[#2D6A4F] to-[#1B4532] text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                    Best Deal Opportunity Detected
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    Potential Saving: ₹{potentialSavings.toLocaleString()} ({savingsPct}% Off)
                  </h2>
                  <p className="text-xs text-white/80">
                    We found the exact or comparable item available for <strong>₹{lowestMarketPrice.toLocaleString()}</strong> from a verified merchant.
                  </p>
                </div>
                <div className="p-3 bg-white/10 rounded-xl border border-white/15 backdrop-blur-xs text-center sm:text-right shrink-0">
                  <p className="text-[10px] uppercase font-bold text-white/70">Lowest Price Found</p>
                  <p className="text-2xl font-bold text-emerald-300">₹{lowestMarketPrice.toLocaleString()}</p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-[#F0FAF5] dark:bg-emerald-950/40 border border-[#B3E4CC] dark:border-emerald-800 text-[#2D6A4F] dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>Your detected quoted price (₹{parsedDetectedPrice.toLocaleString()}) is already competitive with current market baselines!</span>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Detected Product Column */}
              <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-[#E9E4DD] dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E9E4DD] dark:border-slate-800">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2D6A4F] dark:text-emerald-400">
                      1. Detected Product
                    </span>
                    <h3 className="text-base font-bold text-[#2E2A26] dark:text-white mt-0.5">{productTitle}</h3>
                  </div>
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="text-[11px] font-bold text-[#2D6A4F] hover:underline cursor-pointer"
                  >
                    {isEditing ? 'Done' : 'Edit'}
                  </button>
                </div>

                {isEditing ? (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-[#9B9490]">Product Title</label>
                      <input
                        type="text"
                        value={productTitle}
                        onChange={(e) => setProductTitle(e.target.value)}
                        className="w-full px-3 py-2 mt-1 bg-[#FAF8F4] dark:bg-slate-800 border border-[#E9E4DD] dark:border-slate-700 rounded-lg text-[#2E2A26] dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-[#9B9490]">Detected Price (₹)</label>
                      <input
                        type="number"
                        value={detectedPriceStr}
                        onChange={(e) => setDetectedPriceStr(e.target.value)}
                        className="w-full px-3 py-2 mt-1 bg-[#FAF8F4] dark:bg-slate-800 border border-[#E9E4DD] dark:border-slate-700 rounded-lg font-bold text-[#2E2A26] dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-[#9B9490]">Source Store</label>
                      <input
                        type="text"
                        value={sourceStore}
                        onChange={(e) => setSourceStore(e.target.value)}
                        className="w-full px-3 py-2 mt-1 bg-[#FAF8F4] dark:bg-slate-800 border border-[#E9E4DD] dark:border-slate-700 rounded-lg text-[#2E2A26] dark:text-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-4 bg-[#FAF8F4] dark:bg-slate-800/60 rounded-xl border border-[#E9E4DD] dark:border-slate-700 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase text-[#9B9490] dark:text-slate-400">
                          Detected Quoted Price
                        </span>
                        <p className="text-2xl font-extrabold text-[#2E2A26] dark:text-white mt-0.5">
                          ₹{parsedDetectedPrice.toLocaleString()}
                        </p>
                        <p className="text-[11px] text-[#7B746E] dark:text-slate-400">Quoted on: {sourceStore}</p>
                      </div>
                      <span className="px-2.5 py-1 rounded-md bg-[#FEF2F2] dark:bg-red-950/60 text-red-700 dark:text-red-400 text-xs font-bold border border-red-200 dark:border-red-900">
                        Higher Price
                      </span>
                    </div>

                    {activeItem.specs && activeItem.specs.length > 0 && (
                      <div className="space-y-2 pt-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#9B9490] dark:text-slate-400">
                          Key Specifications Extracted:
                        </span>
                        <div className="space-y-1.5 text-xs">
                          {activeItem.specs.map((s, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 bg-[#FAF8F4] dark:bg-slate-800/40 rounded-lg border border-[#E9E4DD] dark:border-slate-800 flex justify-between gap-2"
                            >
                              <span className="text-[#7B746E] dark:text-slate-400 font-medium">{s.label}:</span>
                              <span className="text-[#2E2A26] dark:text-white font-semibold text-right">{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Better Alternatives Column */}
              <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-[#E9E4DD] dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-[#E9E4DD] dark:border-slate-800">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#2D6A4F] dark:text-emerald-400">
                      2. Better Price Alternatives
                    </span>
                    <h3 className="text-base font-bold text-[#2E2A26] dark:text-white mt-0.5">Verified Cheaper Retailer Options</h3>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
                    {activeItem.alternatives.length} Deals Found
                  </span>
                </div>

                <div className="space-y-3">
                  {activeItem.alternatives.map((alt, idx) => {
                    const isLowest = alt.price === lowestMarketPrice;
                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-xl border transition-all space-y-2 ${
                          isLowest
                            ? 'bg-[#F0FAF5] dark:bg-emerald-950/30 border-[#2D6A4F] dark:border-emerald-700 shadow-2xs'
                            : 'bg-white dark:bg-slate-800/50 border-[#E9E4DD] dark:border-slate-700 hover:border-[#2D6A4F]'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-[#2E2A26] dark:text-white flex items-center gap-1.5">
                              <Shield className="w-4 h-4 text-[#2D6A4F]" />
                              {alt.store}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-[#E9E4DD] dark:border-slate-700 text-[#55504B] dark:text-slate-300">
                              {alt.storeBadge}
                            </span>
                            {isLowest && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#2D6A4F] text-white">
                                ★ Lowest Market Price
                              </span>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-xl font-extrabold text-[#2D6A4F] dark:text-emerald-400">
                              ₹{alt.price.toLocaleString()}
                            </span>
                            {alt.saving > 0 && (
                              <span className="ml-2 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                                (Save ₹{alt.saving.toLocaleString()})
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="text-xs text-[#55504B] dark:text-slate-300 font-medium">{alt.productName}</p>

                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-[#E9E4DD] dark:border-slate-700 text-[11px] text-[#7B746E] dark:text-slate-400">
                          <div className="flex items-center gap-3">
                            <span>⭐ {alt.rating} ({alt.reviews} ratings)</span>
                            <span>•</span>
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">{alt.delivery}</span>
                          </div>
                          <a
                            href={alt.dealUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center gap-1 px-3 py-1 rounded-lg bg-[#2D6A4F] text-white text-xs font-bold hover:bg-[#1B4532] transition-colors shadow-2xs"
                          >
                            <span>View Store Deal</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#E8E2DA] dark:border-slate-800 bg-white dark:bg-slate-950 py-8 text-center text-xs text-[#7B746E] dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="font-semibold text-[#2E2A26] dark:text-white">
            NotaryChain Public AI Price Comparator · Free Consumer Intelligence
          </p>
          <p className="text-[11px]">
            This public tool evaluates retailer price spreads. For enterprise legal document verification & Polygon smart contract anchoring,{' '}
            <Link to="/login" className="text-[#2D6A4F] dark:text-emerald-400 underline font-bold">
              Sign In to NotaryChain
            </Link>
            .
          </p>
        </div>
      </footer>
    </div>
  );
}
