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
import Jumbotron from "./components/jumbotron";

export default class HomePreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    
    const jumbotronImage = getAsset(entry.getIn(["data", "hero", "image"]));
    const heroTitle = entry.getIn(["data", "hero", "title"]);
    const heroSubtitle = entry.getIn(["data", "hero", "subtitle"]);
    const heroCta = entry.getIn(["data", "hero", "cta"]) ? {
      text: entry.getIn(["data", "hero", "cta", "text"]),
      link: entry.getIn(["data", "hero", "cta", "link"])
    } : null;
    
    return (
      <div>
        <Jumbotron 
          image={jumbotronImage} 
          title={heroTitle} 
          subtitle={heroSubtitle} 
          cta={heroCta}
        />
        
        <div className="home-sections">
          {/* About Section */}
          <section className="home-section about">
            <div className="container">
              <h2>{entry.getIn(["data", "about", "heading"])}</h2>
              <div dangerouslySetInnerHTML={{ __html: entry.getIn(["data", "about", "text"]) }} />
            </div>
          </section>
          
          {/* Featured Section */}
          <section className="home-section featured">
            <div className="container">
              <h2>{entry.getIn(["data", "featured", "heading"])}</h2>
              <div className="featured-items">
                {(entry.getIn(["data", "featured", "items"]) || []).map((item, i) => {
                  const image = getAsset(item.get("image"));
                  return (
                    <div key={i} className="featured-item">
                      {image && <img src={image} alt={item.get("title")} />}
                      <h3>{item.get("title")}</h3>
                      <p>{item.get("description")}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
          
          {/* Testimonials Section */}
          <section className="home-section testimonials">
            <div className="container">
              <h2>{entry.getIn(["data", "testimonials", "heading"])}</h2>
              <div className="testimonial-items">
                {(entry.getIn(["data", "testimonials", "items"]) || []).map((item, i) => (
                  <div key={i} className="testimonial">
                    <blockquote>"{item.get("quote")}"</blockquote>
                    <cite>— {item.get("author")}</cite>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }
}