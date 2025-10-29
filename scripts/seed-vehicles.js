#!/usr/bin/env node

/**
 * Seed Vehicles
 * Populates the database with sample vehicle inventory
 */

require('dotenv').config();

const DatabaseService = require('../netlify/functions/utils/database-service');

async function seedVehicles() {
  console.log('🚗 Seeding vehicle inventory...');

  const vehicles = [
    {
      stock_number: 'C24001',
      vin: '1G6AB5RA4F0123456',
      year: 2024,
      make: 'Cadillac',
      model: 'XT5',
      trim: 'Premium Luxury',
      body_style: 'SUV',
      exterior_color: 'Radiant Red Tintcoat',
      interior_color: 'Jet Black',
      engine: '2.0L Turbocharged I4',
      transmission: '9-Speed Automatic',
      drivetrain: 'FWD',
      fuel_type: 'Gasoline',
      mileage: 15,
      list_price: 52995,
      sale_price: 49995,
      msrp: 54995,
      status: 'available',
      features: [
        '19" Alloy Wheels',
        'Leather Seating',
        'Navigation System',
        'Apple CarPlay/Android Auto',
        'Wireless Charging',
        'Heated Seats',
        'Power Liftgate'
      ],
      packages: ['Premium Luxury Package', 'Driver Assist Package'],
      image_urls: [
        'https://example.com/images/xt5-1.jpg',
        'https://example.com/images/xt5-2.jpg',
        'https://example.com/images/xt5-3.jpg'
      ],
      video_url: 'https://example.com/videos/xt5-tour.mp4'
    },
    {
      stock_number: 'C24002',
      vin: '1GYS4BKJ4FR123456',
      year: 2024,
      make: 'Cadillac',
      model: 'Escalade',
      trim: 'Sport',
      body_style: 'SUV',
      exterior_color: 'Black Raven',
      interior_color: 'Dark Auburn',
      engine: '6.2L V8',
      transmission: '10-Speed Automatic',
      drivetrain: '4WD',
      fuel_type: 'Gasoline',
      mileage: 8,
      list_price: 89995,
      sale_price: 86995,
      msrp: 92995,
      status: 'available',
      features: [
        '22" Alloy Wheels',
        'Nappa Leather Seating',
        'AKG Studio Audio System',
        'Head-Up Display',
        'Night Vision',
        'Adaptive Cruise Control',
        'Super Cruise'
      ],
      packages: ['Sport Package', 'Theft Protection Package', 'Illumination Package'],
      image_urls: [
        'https://example.com/images/escalade-1.jpg',
        'https://example.com/images/escalade-2.jpg'
      ]
    },
    {
      stock_number: 'C24003',
      vin: '1G6YX36D894567890',
      year: 2024,
      make: 'Cadillac',
      model: 'LYRIQ',
      trim: 'AWD',
      body_style: 'SUV',
      exterior_color: 'Crystal White Tricoat',
      interior_color: 'Sky Cool Gray',
      engine: 'Electric Motor',
      transmission: 'Single-Speed',
      drivetrain: 'AWD',
      fuel_type: 'Electric',
      mileage: 0,
      list_price: 67995,
      sale_price: 64995,
      msrp: 69995,
      status: 'available',
      features: [
        '20" Alloy Wheels',
        'Ultra Cruise',
        'Super Cruise',
        'Wireless Phone Charging',
        'Heated/Ventilated Seats',
        'Panoramic Sunroof',
        'BOSE Audio System'
      ],
      packages: ['Luxury Package', 'Technology Package'],
      image_urls: [
        'https://example.com/images/lyriq-1.jpg',
        'https://example.com/images/lyriq-2.jpg',
        'https://example.com/images/lyriq-3.jpg'
      ],
      video_url: 'https://example.com/videos/lyriq-ev.mp4'
    },
    {
      stock_number: 'C23004',
      vin: '1G6AB5RA3F0789456',
      year: 2023,
      make: 'Cadillac',
      model: 'XT5',
      trim: 'Luxury',
      body_style: 'SUV',
      exterior_color: 'Stellar Black Metallic',
      interior_color: 'Sedona Sauvage',
      engine: '3.6L V6',
      transmission: '9-Speed Automatic',
      drivetrain: 'FWD',
      fuel_type: 'Gasoline',
      mileage: 12500,
      list_price: 45995,
      sale_price: 42995,
      msrp: 48995,
      status: 'available',
      features: [
        '18" Alloy Wheels',
        'Leather Seating',
        'Dual Sunroof',
        'Apple CarPlay/Android Auto',
        'Heated Seats',
        'Power Liftgate',
        'Rear Camera Mirror'
      ],
      packages: ['Luxury Package'],
      image_urls: [
        'https://example.com/images/xt5-luxury-1.jpg'
      ]
    },
    {
      stock_number: 'C24005',
      vin: '1G6YX36D8A4123456',
      year: 2024,
      make: 'Cadillac',
      model: 'LYRIQ',
      trim: 'RWD',
      body_style: 'SUV',
      exterior_color: 'Opulent Blue Metallic',
      interior_color: 'Jet Black',
      engine: 'Electric Motor',
      transmission: 'Single-Speed',
      drivetrain: 'RWD',
      fuel_type: 'Electric',
      mileage: 0,
      list_price: 59995,
      sale_price: 57995,
      msrp: 62995,
      status: 'available',
      features: [
        '19" Alloy Wheels',
        'Ultra Cruise',
        'Wireless Phone Charging',
        'Heated Seats',
        'BOSE Audio System',
        'LED Headlights',
        'Power Liftgate'
      ],
      packages: ['Technology Package'],
      image_urls: [
        'https://example.com/images/lyriq-rwd-1.jpg',
        'https://example.com/images/lyriq-rwd-2.jpg'
      ]
    },
    {
      stock_number: 'C23006',
      vin: '1GYS4BKJ3FR678901',
      year: 2023,
      make: 'Cadillac',
      model: 'Escalade',
      trim: 'Luxury',
      body_style: 'SUV',
      exterior_color: 'Deep Garnet Metallic',
      interior_color: 'Jet Black',
      engine: '6.2L V8',
      transmission: '10-Speed Automatic',
      drivetrain: '4WD',
      fuel_type: 'Gasoline',
      mileage: 8500,
      list_price: 78995,
      sale_price: 75995,
      msrp: 82995,
      status: 'available',
      features: [
        '20" Alloy Wheels',
        'Leather Seating',
        'Navigation System',
        'Apple CarPlay/Android Auto',
        'Head-Up Display',
        'Adaptive Cruise Control',
        'Power Running Boards'
      ],
      packages: ['Luxury Package', 'Theft Protection Package'],
      image_urls: [
        'https://example.com/images/escalade-luxury-1.jpg',
        'https://example.com/images/escalade-luxury-2.jpg'
      ]
    },
    {
      stock_number: 'C24007',
      vin: '1G6AB5RA5F0345678',
      year: 2024,
      make: 'Cadillac',
      model: 'XT5',
      trim: 'Sport',
      body_style: 'SUV',
      exterior_color: 'Shadow Metallic',
      interior_color: 'Jet Black',
      engine: '2.0L Turbocharged I4',
      transmission: '9-Speed Automatic',
      drivetrain: 'AWD',
      fuel_type: 'Gasoline',
      mileage: 25,
      list_price: 55995,
      sale_price: 53995,
      msrp: 57995,
      status: 'available',
      features: [
        '20" Alloy Wheels',
        'Sport Suspension',
        'Leather Seating',
        'Navigation System',
        'Apple CarPlay/Android Auto',
        'Heated Seats',
        'Power Liftgate'
      ],
      packages: ['Sport Package', 'Technology Package'],
      image_urls: [
        'https://example.com/images/xt5-sport-1.jpg',
        'https://example.com/images/xt5-sport-2.jpg'
      ]
    },
    {
      stock_number: 'C22008',
      vin: '1GYS4BKJ2FR901234',
      year: 2022,
      make: 'Cadillac',
      model: 'Escalade',
      trim: 'Platinum',
      body_style: 'SUV',
      exterior_color: 'Antique Brass Metallic',
      interior_color: 'Titan Gray',
      engine: '6.2L V8',
      transmission: '10-Speed Automatic',
      drivetrain: '4WD',
      fuel_type: 'Gasoline',
      mileage: 28500,
      list_price: 69995,
      sale_price: 66995,
      msrp: 74995,
      status: 'available',
      features: [
        '22" Ultra Bright Wheels',
        'Nappa Leather Seating',
        'AKG Studio Audio System',
        'Head-Up Display',
        'Night Vision',
        'Adaptive Cruise Control',
        'Massage Seats'
      ],
      packages: ['Platinum Package', 'Theft Protection Package', 'Illumination Package'],
      image_urls: [
        'https://example.com/images/escalade-platinum-1.jpg',
        'https://example.com/images/escalade-platinum-2.jpg',
        'https://example.com/images/escalade-platinum-3.jpg'
      ]
    }
  ];

  for (const vehicle of vehicles) {
    try {
      // Check if vehicle already exists
      const existing = await DatabaseService.getVehicleByStockNumber(vehicle.stock_number);
      if (existing) {
        console.log(`⚠️  Vehicle ${vehicle.stock_number} already exists, skipping...`);
        continue;
      }

      // Create the vehicle
      const created = await DatabaseService.createVehicle(vehicle);
      console.log(`✅ Created vehicle: ${created.year} ${created.make} ${created.model} (${created.stock_number})`);

    } catch (error) {
      console.error(`❌ Failed to create vehicle ${vehicle.stock_number}:`, error.message);
    }
  }

  console.log('🎉 Vehicle seeding completed!');
}

// Run the seeder
if (require.main === module) {
  seedVehicles().catch(console.error);
}

module.exports = seedVehicles;