import React from "react";

export default class Jumbotron extends React.Component {
  render() {
    const {image, title, subtitle, cta} = this.props;
    
    return (
      <div className="hero" style={image ? {backgroundImage: `url(${image})`} : {}}>
        <div className="hero-content">
          <h1 className="hero-title">{title}</h1>
          {subtitle && <h2 className="hero-subtitle">{subtitle}</h2>}
          {cta && (
            <a href={cta.link} className="hero-cta btn">{cta.text}</a>
          )}
        </div>
      </div>
    );
  }
}
