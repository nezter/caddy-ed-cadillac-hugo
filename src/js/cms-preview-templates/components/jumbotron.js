import React from "react";

export default class Jumbotron extends React.Component {
  render() {
    const {image, title} = this.props;
    
    return (
      <div className="jumbotron" 
        style={{
          backgroundImage: image && `url(${image})`,
        }}
      >
        <div className="container">
          <div className="jumbotron-content">
            <h1>{title}</h1>
          </div>
        </div>
      </div>
    );
  }
}
