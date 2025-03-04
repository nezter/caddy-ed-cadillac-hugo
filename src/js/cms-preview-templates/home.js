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

export default function HomePreview({ entry, getAsset }) {
  const data = entry.getIn(["data"]).toJS();
  const image = getAsset(data.image);
  
  return (
    <div className="home-preview">
      <header className="hero" style={{ backgroundImage: `url(${image})` }}>
        <div className="container">
          <h1>{data.title}</h1>
          <div className="subtitle">{data.subtitle}</div>
          {data.cta && (
            <div className="cta-button">
              <a href={data.cta.link}>{data.cta.text}</a>
            </div>
          )}
        </div>
      </header>
      
      <section className="intro-section">
        <div className="container">
          <h2>{data.intro.heading}</h2>
          <p>{data.intro.text}</p>
        </div>
      </section>
      
      <section className="featured-inventory">
        <div className="container">
          <h2>{data.inventory.heading}</h2>
          <div className="inventory-placeholder">
            <p>[Featured Inventory Items Will Appear Here]</p>
          </div>
        </div>
      </section>
      
      <section className="testimonial-section">
        <div className="container">
          <h2>{data.testimonials.heading}</h2>
          <div className="testimonials">
            {data.testimonials.items && data.testimonials.items.map((item, i) => (
              <div className="testimonial" key={i}>
                <blockquote>"{item.quote}"</blockquote>
                <div className="author">- {item.author}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}