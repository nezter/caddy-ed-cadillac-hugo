import React from "react";

export default class InventoryPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    const data = entry.getIn(["data"]).toJS();
    
    return (
      <div className="inventory-page">
        <div className="hero" style={{backgroundImage: `url(${getAsset(data.hero_image)})`}}>
          <h1>{data.title}</h1>
          <div className="subtitle">{data.subtitle}</div>
        </div>
        
        <div className="container">
          <div className="inventory-filters">
            <h2>{data.filters_title || "Find Your Perfect Vehicle"}</h2>
            <p>{data.filters_description || "Use the filters below to narrow your search"}</p>
            
            {/* Enhanced filter mockup for preview */}
            <div className="filter-form-preview">
              <div className="filter-section">
                <h3>Vehicle Type</h3>
                <div className="button-group">
                  <button className="vehicle-type-toggle active">All Vehicles</button>
                  <button className="vehicle-type-toggle">New Vehicles</button>
                  <button className="vehicle-type-toggle">Used Vehicles</button>
                  <button className="vehicle-type-toggle">Certified Pre-Owned</button>
                </div>
              </div>
              
              <div className="filter-section">
                <h3>Basic Filters</h3>
                <div className="form-group-preview">
                  <label>Make</label>
                  <select disabled><option>Select Make</option></select>
                </div>
                <div className="form-group-preview">
                  <label>Model</label>
                  <select disabled><option>Select Model</option></select>
                </div>
                <div className="form-group-preview">
                  <label>Year Range</label>
                  <div className="range-inputs">
                    <select disabled><option>Min Year</option></select>
                    <select disabled><option>Max Year</option></select>
                  </div>
                </div>
                <div className="form-group-preview">
                  <label>Price Range</label>
                  <div className="range-inputs">
                    <select disabled><option>Min Price</option></select>
                    <select disabled><option>Max Price</option></select>
                  </div>
                </div>
              </div>
              
              <div className="filter-section">
                <h3>Additional Filters</h3>
                <div className="form-group-preview checkbox-group">
                  <label><input type="checkbox" disabled /> Leather Seats</label>
                  <label><input type="checkbox" disabled /> Navigation</label>
                  <label><input type="checkbox" disabled /> Bluetooth</label>
                  <label><input type="checkbox" disabled /> Backup Camera</label>
                </div>
              </div>
              
              <div className="filter-section">
                <button className="cta-button">Apply Filters</button>
                <button className="reset-button">Reset All</button>
              </div>
            </div>
          </div>
          
          <div className="inventory-results">
            <h2>{data.results_title || "Available Vehicles"}</h2>
            <div className="results-header">
              <p>Showing <span className="results-count">X</span> vehicles</p>
              <div className="sort-controls">
                <label>Sort by:</label>
                <select disabled>
                  <option>Price: Low to High</option>
                  <option>Price: High to Low</option>
                  <option>Year: Newest First</option>
                  <option>Year: Oldest First</option>
                  <option>Mileage: Low to High</option>
                </select>
              </div>
            </div>
            
            {/* Enhanced vehicle grid mockup */}
            <div className="vehicle-grid-preview">
              {Array(6).fill().map((_, i) => (
                <div className="vehicle-card" key={i}></div>
                  <div className={i % 3 === 0 ? "vehicle-badge new-badge" : i % 3 === 1 ? "vehicle-badge used-badge" : "vehicle-badge certified-badge"}>
                    {i % 3 === 0 ? "New" : i % 3 === 1 ? "Used" : "Certified"}
                  </div>
                  <div className="vehicle-image-placeholder"></div>
                  <div className="vehicle-details">
                    <h3>Sample {i % 2 === 0 ? "Cadillac" : "Luxury"} Vehicle {i+1}</h3>
                    <p className="vehicle-price">${(35000 + i * 5000).toLocaleString()}</p>
                    <div className="vehicle-meta">
                      <span>{i * 5000} mi</span>
                      <span>{i % 2 === 0 ? "SUV" : "Sedan"}</span>
                      <span>{i % 3 === 0 ? "Black" : i % 3 === 1 ? "White" : "Silver"}</span>
                    </div>
                    <p className="vehicle-description">Experience luxury and performance with this {i % 2 === 0 ? "premium" : "elegant"} vehicle...</p>
                    <div className="vehicle-actions">
                      <button className="cta-button">View Details</button>
                      <button className="secondary-button">Save</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="pagination-preview">
              <button disabled>← Previous</button>
              <div className="page-numbers">
                <span className="current-page">1</span>
                <span>2</span>
                <span>3</span>
              </div>
              <button disabled>Next →</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
