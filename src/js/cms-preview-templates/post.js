import React from "react";
import format from "date-fns/format";

export default class PostPreview extends React.Component {
  render() {
    const {entry, widgetFor, getAsset} = this.props;
    const image = entry.getIn(["data", "featured_image"]);
    const bg = image && getAsset(image);
    
    return (
      <article className="blog-post">
        <header className="featured-header" style={{ backgroundImage: bg ? `url(${bg.toString()})` : "" }}>
          <div className="container">
            <h1>{entry.getIn(["data", "title"])}</h1>
            <p className="post-meta">
              <time>
                {format(entry.getIn(["data", "date"]), "MMMM DD, YYYY")}
              </time>
              <span> &bull; </span>
              <span>{entry.getIn(["data", "author"])}</span>
            </p>
          </div>
        </header>
        
        <div className="container">
          <div className="post-content">
            {widgetFor("body")}
          </div>
        </div>
      </article>
    );
  }
}
