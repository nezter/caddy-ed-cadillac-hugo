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

export default class HomePreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    
    const hero = entry.getIn(["data", "hero"]);
    const heroBg = getAsset(hero.get("background_image"));
    const featuredVehicles = entry.getIn(["data", "featured_vehicles"]) || [];
    
    return (
      <div className="home-page">
        <section className="hero" style={{backgroundImage: `url(${heroBg.toString()})`}}>
          <div className="container">
            <div className="hero-content">
              <h1>{hero.get("heading")}</h1>
              <p>{hero.get("subheading")}</p>
              <a href={hero.get("cta_link")} className="btn btn-primary">{hero.get("cta_text")}</a>
            </div>
          </div>
        </section>
        
        <section className="featured-vehicles">
          <div className="container">
            <h2 className="section-title">{entry.getIn(["data", "featured_title"])}</h2>
            <div className="vehicle-grid">
              {featuredVehicles.map((vehicle, i) => (
                <div key={i} className="vehicle-card">
                  <img src={getAsset(vehicle.get("image")).toString()} alt={vehicle.get("model")} />
                  <h3>{vehicle.get("year")} {vehicle.get("make")} {vehicle.get("model")}</h3>
                  <p className="price">${vehicle.get("price")}</p>
                  <a href={vehicle.get("link")} className="btn">View Details</a>
                </div>
              ))}
            </div>
            <div className="text-center">
              <a href="/inventory" className="btn btn-secondary">View All Inventory</a>
            </div>
          </div>
        </section>
        
        <section className="services">
          <div className="container">
            <h2 className="section-title">{entry.getIn(["data", "services_title"])}</h2>
            <div className="services-grid">
              {(entry.getIn(["data", "services"]) || []).map((service, i) => (
                <div key={i} className="service-card">
                  <div className="service-icon">
                    <img src={getAsset(service.get("icon")).toString()} alt="" />
                  </div>
                  <h3>{service.get("name")}</h3>
                  <p>{service.get("description")}</p>
                  <a href={service.get("link")}>Learn more</a>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }
}