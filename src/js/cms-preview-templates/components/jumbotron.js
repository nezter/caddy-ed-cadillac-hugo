import React from "react";

export default class Jumbotron extends React.Component {
  render() {
    const { image, title, subtitle, cta } = this.props;
    
    return (
      <div className="jumbotron" style={{ backgroundImage: image && `url(${image})` }}>
        <div className="container">
          <div className="jumbotron-content">
            {title && <h1>{title}</h1>}
            {subtitle && <div className="subtitle">{subtitle}</div>}
            {cta && (
              <div className="cta">
                <a href={cta.link} className="btn">{cta.text}</a>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
}
