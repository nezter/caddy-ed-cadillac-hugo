import React from "react";

export default class ContactPreview extends React.Component {
  render() {
    const {entry} = this.props;
    
    return (
      <div className="contact-page">
        <div className="container">
          <div className="contact-content">
            <div className="contact-info">
              <h1>{entry.getIn(["data", "title"])}</h1>
              <div className="contact-text">{entry.getIn(["data", "intro"])}</div>
              
              <div className="contact-details">
                <div className="contact-item">
                  <strong>Address:</strong>
                  <p dangerouslySetInnerHTML={{ __html: entry.getIn(["data", "address"]) }}></p>
                </div>
                
                <div className="contact-item">
                  <strong>Hours:</strong>
                  <p dangerouslySetInnerHTML={{ __html: entry.getIn(["data", "hours"]) }}></p>
                </div>
                
                <div className="contact-item">
                  <strong>Phone:</strong>
                  <p>{entry.getIn(["data", "phone"])}</p>
                </div>
                
                <div className="contact-item">
                  <strong>Email:</strong>
                  <p>{entry.getIn(["data", "email"])}</p>
                </div>
              </div>
            </div>
            
            <div className="contact-form">
              <h2>Send us a message</h2>
              <form className="contact-form">
                <div className="form-group">
                  <label htmlFor="name">Name</label>
                  <input type="text" id="name" placeholder="Your Name" />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input type="email" id="email" placeholder="Your Email" />
                </div>
                <div className="form-group">
                  <label htmlFor="message">Message</label>
                  <textarea id="message" rows="5" placeholder="Your Message"></textarea>
                </div>
                <button type="submit" className="btn btn-primary">Send Message</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
