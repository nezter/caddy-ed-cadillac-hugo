import React from "react";
import format from "date-fns/format";

export default class PostPreview extends React.Component {
  render() {
    const {entry, widgetFor, getAsset} = this.props;
    const image = getAsset(entry.getIn(["data", "image"]));
    
    return (
      <article className="post">
        <header className="post-header">
          {image && (
            <div className="post-image">
              <img src={image} alt={entry.getIn(["data", "title"])} />
            </div>
          )}
          <h1>{entry.getIn(["data", "title"])}</h1>
          <div className="post-meta">
            <time>{format(entry.getIn(["data", "date"]), "MMMM dd, yyyy")}</time>
            {entry.getIn(["data", "author"]) && (
              <span className="post-author">By {entry.getIn(["data", "author"])}</span>
            )}
          </div>
        </header>
        
        <div className="post-content">
          {widgetFor("body")}
        </div>
      </article>
    );
  }
}
