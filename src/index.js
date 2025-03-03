import './css/main.css';
import 'lazysizes';
import './js/cms';
import VehicleComparison from './js/vehicleComparison';
import FinancingCalculator from './js/financingCalculator';
import './js/leadCapture';
import './js/inventoryFilter';
import './js/salesDashboard';
import './js/testimonialSlider';
import './js/appointmentScheduler';
import { registerSW } from './sw-register';

// Initialize service worker
if (process.env.NODE_ENV === 'production') {
  registerSW();
}

// Expose components to global scope for usage in templates
window.VehicleComparison = VehicleComparison;
window.FinancingCalculator = FinancingCalculator;

console.log("Cadillac website initialized");
