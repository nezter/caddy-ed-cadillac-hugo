import React from "react";
import format from "date-fns/format";

export default class SalesRepPreview extends React.Component {
  render() {
    const {entry, widgetFor, getAsset} = this.props;
    const data = entry.getIn(["data"]).toJS();

    return (
      <div className="sales-rep-profile">
        <div className="header-section bg-primary">
          <h1 className="name">{data.title}</h1>
          <p className="position">{data.position || "Sales Representative"}</p>
        </div>
        
        <div className="rep-container">
          <div className="rep-photo">
            {data.image && <img src={getAsset(data.image).toString()} alt={data.title} />}
          </div>
          
          <div className="rep-details">
            <div className="contact-info">
              {data.phone && <p className="phone"><strong>Phone:</strong> <a href={`tel:${data.phone}`}>{data.phone}</a></p>}
              {data.email && <p className="email"><strong>Email:</strong> <a href={`mailto:${data.email}`}>{data.email}</a></p>}
            </div>
            
            <div className="specialties">
              <h2>Specialties</h2>
              {data.specialties && (
                <ul>
                  {data.specialties.map((specialty, i) => (
                    <li key={i}>{specialty}</li>
                  ))}
                </ul>
              )}
            </div>
            
            <div className="certifications">
              <h2>Certifications</h2>
              {data.certifications && (
                <ul>
                  {data.certifications.map((cert, i) => (
                    <li key={i}>{cert}</li>
                  ))}
                </ul>
              )}
            </div>
            
            <div className="rep-content">
              <h2>About {data.title}</h2>
              {widgetFor("body")}
            </div>
            
            {data.testimonials && data.testimonials.length > 0 && (
              <div className="testimonials">
                <h2>Customer Testimonials</h2>
                <div className="testimonial-list">
                  {data.testimonials.map((testimonial, i) => (
                    <div key={i} className="testimonial">
                      <blockquote>"{testimonial.quote}"</blockquote>
                      <cite>— {testimonial.author}</cite>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="cta-section">
          <h3>Looking for your next Cadillac?</h3>
          <p>Schedule an appointment with {data.title} today!</p>
          <button className="schedule-btn">Schedule Appointment</button>
        </div>
      </div>
    );
  }
}
