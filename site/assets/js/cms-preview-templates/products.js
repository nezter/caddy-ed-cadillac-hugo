import React from "react";
import Jumbotron from "./components/jumbotron";

export default class ProductsPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    
    // Data from the CMS entry
    const image = getAsset(entry.getIn(["data", "image"]));
    const title = entry.getIn(["data", "title"]);
    const subtitle = entry.getIn(["data", "subtitle"]);
    
    // Get product entries
    const products = entry.getIn(["data", "products"]) || [];

    return <div>
      <Jumbotron image={image} title={title} subtitle={subtitle} />
      
      <div className="bg-off-white pv4">
        <div className="mw7 center ph3 pt4">
          <h2 className="f2 b lh-title mb2">{entry.getIn(["data", "intro", "heading"])}</h2>
          <p className="mw6">{entry.getIn(["data", "intro", "description"])}</p>
          
          <div className="flex-ns flex-wrap mhn2-ns mb3">
            {products && products.map((product, i) => {
              const productImg = getAsset(product.get("image"));
              return (
                <div className="ph2-ns w-50-ns" key={i}>
                  <div className="bg-white br3 pa3 mb3">
                    <h3 className="f3 b lh-title mb1">{product.get("name")}</h3>
                    <img src={productImg.toString()} alt={product.get("name")} className="db mb2 mw-100" />
                    <p className="mb0">{product.get("description")}</p>
                    <p className="f5 b mt2">${product.get("price")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>;
  }
}
