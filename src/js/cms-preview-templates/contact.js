import React from "react";

export default class ContactPreview extends React.Component {
  render() {
    const {entry} = this.props;
    
    return (
      <div className="contact-page">
        <header>
          <h1>{entry.getIn(["data", "title"])}</h1>
          <p>{entry.getIn(["data", "description"])}</p>
        </header>
        
        <div className="contact-content">
          <div className="contact-info">
            {entry.getIn(["data", "phone"]) && (
              <div className="contact-item">
                <h4>Phone</h4>
                <p>{entry.getIn(["data", "phone"])}</p>
              </div>
            )}
            
            {entry.getIn(["data", "email"]) && (
              <div className="contact-item">
                <h4>Email</h4>
                <p>{entry.getIn(["data", "email"])}</p>
              </div>
            )}
            
            {entry.getIn(["data", "address"]) && (
              <div className="contact-item">
                <h4>Address</h4>
                <p>{entry.getIn(["data", "address"])}</p>
              </div>
            )}
            
            {entry.getIn(["data", "hours"]) && (
              <div className="contact-item">
                <h4>Business Hours</h4>
                <p>{entry.getIn(["data", "hours"])}</p>
              </div>
            )}
          </div>
          
          <div className="contact-form-preview">
            <h3>Contact Form</h3>
            <div className="form-preview">
              <div className="form-group">
                <label>Name</label>
                <input type="text" disabled placeholder="Your name" />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" disabled placeholder="Your email" />
              </div>
              <div className="form-group">
                <label>Message</label>
                <textarea disabled placeholder="Your message"></textarea>
              </div>
              <button disabled>Send Message</button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
