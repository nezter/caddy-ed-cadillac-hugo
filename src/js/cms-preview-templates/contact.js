import React from "react";
import Jumbotron from "./components/jumbotron";

export default class ContactPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    
    const image = getAsset(entry.getIn(["data", "image"]));
    const title = entry.getIn(["data", "title"]);
    const subtitle = entry.getIn(["data", "subtitle"]);
    
    return <div>
      <Jumbotron image={image} title={title} subtitle={subtitle} />
      
      <div className="ph3 bg-off-white">
        <div className="center mw6 pv3">
          <h3 className="f3 b lh-title mb2">{entry.getIn(["data", "contact_heading"])}</h3>
          <p className="mb4">{entry.getIn(["data", "contact_text"])}</p>
          
          <div className="flex-l">
            <div className="w-50-l pr4-l mb4 mb0-l">
              <h4 className="f4 b lh-title mb3">Contact Information</h4>
              <div>
                <p className="mb2">Address: {entry.getIn(["data", "address"])}</p>
                <p className="mb2">Phone: {entry.getIn(["data", "phone"])}</p>
                <p className="mb2">Email: {entry.getIn(["data", "email"])}</p>
                <p className="mb2">Hours: {entry.getIn(["data", "hours"])}</p>
              </div>
            </div>
            
            <div className="w-50-l pl4-l">
              <h4 className="f4 b lh-title mb3">Contact Form</h4>
              <form className="black-80">
                <div className="measure mb3">
                  <label htmlFor="name" className="f6 b db mb2">Name</label>
                  <input type="text" id="name" className="input-reset ba b--black-20 pa2 mb2 db w-100" />
                </div>
                
                <div className="measure mb3">
                  <label htmlFor="email" className="f6 b db mb2">Email</label>
                  <input type="email" id="email" className="input-reset ba b--black-20 pa2 mb2 db w-100" />
                </div>
                
                <div className="measure mb3">
                  <label htmlFor="message" className="f6 b db mb2">Message</label>
                  <textarea id="message" className="input-reset ba b--black-20 pa2 mb2 db w-100" rows="6"></textarea>
                </div>
                
                <div className="measure">
                  <button type="submit" className="btn w-100 w-auto-ns">Send</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>;
  }
}
