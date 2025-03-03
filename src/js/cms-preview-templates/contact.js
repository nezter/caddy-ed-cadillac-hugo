import React from "react";

export default function ContactPreview({ entry }) {
  const data = entry.getIn(["data"]).toJS();
  
  return (
    <div className="contact-page">
      <h1>{data.title || "Contact Us"}</h1>
      <div dangerouslySetInnerHTML={{ __html: data.body }}></div>
      
      <div className="contact-container">
        <div className="contact-info">
          <h3>Dealership Information</h3>
          <p><strong>Phone:</strong> {data.phone || "(555) 123-4567"}</p>
          <p><strong>Email:</strong> {data.email || "sales@caddyed.com"}</p>
          <p><strong>Address:</strong> {data.address || "123 Auto Lane, Car City, ST 12345"}</p>
          <p><strong>Hours:</strong> {data.hours || "Mon-Sat: 9am-8pm, Sun: 10am-6pm"}</p>
        </div>
        
        <form className="contact-form">
          <h3>Interested in a Vehicle?</h3>
          <div className="form-group">
            <label htmlFor="name">Full Name*</label>
            <input type="text" id="name" name="name" disabled />
          </div>
          
          <div className="form-group">
            <label htmlFor="email">Email*</label>
            <input type="email" id="email" name="email" disabled />
          </div>
          
          <div className="form-group">
            <label htmlFor="phone">Phone*</label>
            <input type="tel" id="phone" name="phone" disabled />
          </div>
          
          <div className="form-group">
            <label htmlFor="vehicle">Vehicle of Interest</label>
            <select id="vehicle" name="vehicle" disabled>
              <option>Select a Vehicle</option>
              <option>Cadillac Escalade</option>
              <option>Cadillac CT4</option>
              <option>Cadillac XT6</option>
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="timeframe">Purchase Timeframe</label>
            <select id="timeframe" name="timeframe" disabled>
              <option>Select Timeframe</option>
              <option>Immediately</option>
              <option>1-3 months</option>
              <option>3-6 months</option>
              <option>Just browsing</option>
            </select>
          </div>
          
          <div className="form-group">
            <label htmlFor="message">Additional Details</label>
            <textarea id="message" name="message" disabled rows="5"></textarea>
          </div>
          
          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="financing" disabled /> Interested in financing options
            </label>
          </div>
          
          <div className="form-group">
            <label className="checkbox-label">
              <input type="checkbox" name="trade-in" disabled /> I have a trade-in
            </label>
          </div>
          
          <button type="button" className="submit-button" disabled>Submit Inquiry</button>
        </form>
      </div>
    </div>
  );
}
