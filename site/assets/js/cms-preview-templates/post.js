import React from "react";
import format from "date-fns/format";

export default class PostPreview extends React.Component {
  render() {
    const {entry, widgetFor, getAsset} = this.props;
    const image = entry.getIn(["data", "featured_image"]) ? getAsset(entry.getIn(["data", "featured_image"])).toString() : "";
    
    return (
      <div className="ph3 bg-off-white">
        <div className="center mw7 pv4">
          <h1 className="f2 lh-title b mb3">{entry.getIn(["data", "title"])}</h1>
          <div className="flex justify-between grey-3">
            <div className="mb2">
              <div className="f6">{format(entry.getIn(["data", "date"]), "MMM dd, yyyy")}</div>
              <div className="f6">By {entry.getIn(["data", "author"]) || "Editor"}</div>
            </div>
            <div className="mb2">
              <div className="f6">
                {entry.getIn(["data", "categories"]) && entry.getIn(["data", "categories"]).map((cat, i) => (
                  <span key={i} className="dib mr1">
                    {cat}
                    {i < entry.getIn(["data", "categories"]).size - 1 ? ", " : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>
          
          {image && (
            <div className="tc mb3">
              <img src={image} alt={entry.getIn(["data", "title"])} className="db w-100" />
              {entry.getIn(["data", "image_caption"]) && (
                <small className="i">{entry.getIn(["data", "image_caption"])}</small>
              )}
            </div>
          )}
          
          <div className="cms mw6">
            <p className="f4 b lh-title mb2 primary">{entry.getIn(["data", "description"])}</p>
            {widgetFor("body")}
          </div>
          
          {entry.getIn(["data", "tags"]) && (
            <div className="mt4">
              <h4 className="f5 b lh-title mb3">Tags</h4>
              <div className="flex flex-wrap">
                {entry.getIn(["data", "tags"]).map((tag, i) => (
                  <span key={i} className="bg-grey-1 ph2 pv1 mr2 mb2 dib br1">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
