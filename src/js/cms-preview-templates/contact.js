import React from "react";

export default function ContactPreview({ entry }) {
  const data = entry.getIn(["data"]).toJS();
  
  return (
    <div>
      <h1>{data.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: data.body }}></div>
      
      <form className="contact-form">
        <div className="form-group">
          <label htmlFor="name">Name</label>
          <input type="text" id="name" name="name" disabled />
        </div>
        
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input type="email" id="email" name="email" disabled />
        </div>
        
        <div className="form-group">
          <label htmlFor="message">Message</label>
          <textarea id="message" name="message" disabled></textarea>
        </div>
        
        <button type="button" disabled>Send</button>
      </form>
    </div>
  );
}
