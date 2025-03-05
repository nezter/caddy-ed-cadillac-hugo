import React from "react";
import Jumbotron from "./components/jumbotron";

export default class ValuesPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    
    const image = getAsset(entry.getIn(["data", "image"]));
    const title = entry.getIn(["data", "title"]);
    const subtitle = entry.getIn(["data", "subtitle"]);
    
    const values = entry.getIn(["data", "values"]) || [];

    return <div>
      <Jumbotron image={image} title={title} subtitle={subtitle} />
      
      <div className="bg-off-white pv4">
        <div className="mw7 center ph3 pt4">
          <h2 className="f2 b lh-title mb2">{entry.getIn(["data", "values_heading"])}</h2>
          <p className="mw6 center">{entry.getIn(["data", "values_description"])}</p>
          
          <div className="flex-ns mhn2-ns mb3">
            {values && values.map((value, i) => {
              const valueImg = getAsset(value.get("image"));
              return (
                <div className="ph2-ns w-33-ns" key={i}>
                  <div className="tc pv4">
                    <img src={valueImg.toString()} alt={value.get("heading")} className="w4 db center mb3" />
                    <h3 className="f4 b lh-title mb2">{value.get("heading")}</h3>
                    <p>{value.get("text")}</p>
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
