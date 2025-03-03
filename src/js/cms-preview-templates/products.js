import React from "react";
import format from "date-fns/format";

import Jumbotron from "./components/jumbotron";

export default function ProductsPreview({ entry, getAsset }) {
  const data = entry.getIn(["data"]).toJS();
  const image = getAsset(data.image);
  
  return (
    <div>
      <h1>{data.title}</h1>
      {image && <img src={image.toString()} alt={data.title} />}
      <div dangerouslySetInnerHTML={{ __html: data.body }}></div>
      
      {data.products && (
        <div className="products">
          {data.products.map((product, i) => (
            <div key={i} className="product">
              <h3>{product.name}</h3>
              <p>{product.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
