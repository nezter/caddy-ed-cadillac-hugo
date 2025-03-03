import React from "react";
import format from "date-fns/format";

export default class PostPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    let image = getAsset(entry.getIn(["data", "image"]));

    // Bit of a nasty hack to make relative paths work as expected as a background image here
    if (image && !image.fileObj) {
      image = window.parent.location.protocol + "//" + window.parent.location.host + image;
    }

    return (
      <div className="post-content">
        <div className="post-header">
          <h1>{entry.getIn(["data", "title"])}</h1>
          <div className="post-meta">
            <span className="post-date">
              {format(entry.getIn(["data", "date"]), "MMMM dd, yyyy")}
            </span>
            {entry.getIn(["data", "author"]) && 
              <span className="post-author">
                By {entry.getIn(["data", "author"])}
              </span>
            }
          </div>
        </div>
        
        {image && 
          <div className="featured-image">
            <img src={image} alt={entry.getIn(["data", "title"])} />
          </div>
        }
        
        <div className="post-body" dangerouslySetInnerHTML={{ __html: entry.getIn(["data", "body"]) }} />
      </div>
    );
  }
}
