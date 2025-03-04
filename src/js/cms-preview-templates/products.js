import React from "react";
import format from "date-fns/format";

import Jumbotron from "./components/jumbotron";

export default class ProductsPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    
    return (
      <div className="products-page">
        <header>
          <h1>{entry.getIn(["data", "title"])}</h1>
          <p>{entry.getIn(["data", "description"])}</p>
        </header>
        
        <div className="products-list">
          {(entry.getIn(["data", "items"]) || []).map((item, i) => {
            const image = getAsset(item.get("image"));
            
            return (
              <div key={i} className="product-item">
                {image && <img src={image} alt={item.get("title")} />}
                <h3>{item.get("title")}</h3>
                <p>{item.get("description")}</p>
                {item.get("price") && (
                  <div className="product-price">${item.get("price")}</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
