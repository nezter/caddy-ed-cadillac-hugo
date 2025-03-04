import React from "react";
import format from "date-fns/format";

import Jumbotron from "./components/jumbotron";

export default class PostPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    let image = getAsset(entry.getIn(["data", "image"]));

    // Bit of a nasty hack to make relative paths work as expected as a background image here
    if (image && !image.fileObj) {
        image = window.parent.location.protocol + "//" + window.parent.location.host + image;
    }

    return <div>
        <Jumbotron image={image} title={entry.getIn(["data", "title"])}/>

        <div className="pb4">
        {(entry.getIn(['data', 'testimonials']) || []).map((testimonial, index) => <div className="center mb3 ph3" key={index}>
        	<blockquote className="bg-grey-1 primary pa3 mb3 br1 b mw6 center">
        		<p className="f4 mb0">“{testimonial.get('quote')}”</p>
        		<cite className="tr db grey-3">{testimonial.get('author')}</cite>
        	</blockquote>
        </div>)}
      </div>
        <div className="bg-off-white pv4">
          <div className="ph3 mw7 center">
            <h2 className="f2 b lh-title mb2">{entry.getIn(["data", "intro", "heading"])}</h2>
            <p className="mb4 mw6">{entry.getIn(["data", "intro", "text"])}</p>

            <div className="flex-ns mhn2-ns mb3">
              {(entry.getIn(["data", "products"]) || []).map((product, i) => <div className="ph2-ns w-50-ns" key={i}>
                <img src={getAsset(product.get("image"))} alt="" className="center db mb3" style={{width: "240px"}}/>
                <p>{product.get("text")}</p>
              </div>)}
            </div>

            <div className="tc">
              <a href="#" className="btn raise">See all products</a>
            </div>
          </div>
        </div>

        <div className="bg-grey-1 pv4">
          <div className="ph3 mw7 center">

            <div className="flex-l mhn2-l">
              <div className="w-40-l ph2-l">
                <h2 className="f2 b lh-title mb2">{entry.getIn(["data", "values", "heading"])}</h2>

                <p>{entry.getIn(["data", "values", "text"])}</p>
              </div>

              <div className="w-60-l ph2-l">
                <img src="/img/home-about-section.jpg" alt="" className="mb3"/>
              </div>
            </div>

            <div className="tc">
              <a href="{{.buttonLink}}" className="btn raise">Read more</a>
            </div>

          </div>
        </div>



    </div>
  }
}

import React from "react";

export default class HomePreview extends React.Component {
  render() {
    const { entry, getAsset } = this.props;
    const data = entry.getIn(["data"]).toJS();
    
    // Get hero image
    const heroImage = getAsset(data.hero_image);
    
    // Get featured vehicles
    const featuredVehicles = data.featured_vehicles || [];
    
    return (
      <div className="preview-content">
        <div className="hero-section">
          <div className="hero-image">
            {heroImage && <img src={heroImage.toString()} alt={data.hero_heading} />}
          </div>
          <div className="hero-content">
            <h1>{data.hero_heading}</h1>
            <p>{data.hero_subheading}</p>
            {data.hero_cta_text && 
              <div className="hero-cta">
                <button className="btn btn-primary">{data.hero_cta_text}</button>
              </div>
            }
          </div>
        </div>
        
        <div className="featured-section">
          <h2>{data.featured_heading || "Featured Vehicles"}</h2>
          <div className="featured-vehicles">
            {featuredVehicles.map((vehicle, i) => (
              <div className="vehicle-card" key={i}>
                <div className="vehicle-image">
                  {vehicle.image && 
                    <img src={getAsset(vehicle.image).toString()} alt={vehicle.title} />
                  }
                </div>
                <div className="vehicle-details">
                  <h3>{vehicle.title}</h3>
                  <div className="vehicle-price">${vehicle.price}</div>
                  <div className="vehicle-meta">
                    <span>{vehicle.mileage} miles</span>
                    <span>{vehicle.color}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="cta-section">
          <h2>{data.cta_heading}</h2>
          <p>{data.cta_text}</p>
          <button className="btn btn-primary">{data.cta_button_text}</button>
        </div>
        
        <div className="about-section">
          <h2>{data.about_heading || "About Caddy Ed"}</h2>
          <div className="about-content">
            <p>{data.about_content}</p>
          </div>
        </div>
      </div>
    );
  }
}