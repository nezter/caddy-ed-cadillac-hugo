import React from "react";

export default class ValuesPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    
    return (
      <div className="values-page">
        <header>
          <h1>{entry.getIn(["data", "title"])}</h1>
          <p>{entry.getIn(["data", "intro"])}</p>
        </header>
        
        <div className="values-list">
          {(entry.getIn(["data", "values"]) || []).map((value, i) => {
            const image = getAsset(value.get("image"));
            
            return (
              <div key={i} className="value-item">
                <div className="value-content">
                  <h3>{value.get("heading")}</h3>
                  <p>{value.get("text")}</p>
                </div>
                {image && (
                  <div className="value-image">
                    <img src={image} alt={value.get("heading")} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
}
