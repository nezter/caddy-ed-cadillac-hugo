import React from "react";
import { format } from "date-fns";

export default class PostPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    const image = getAsset(entry.getIn(["data", "image"]));
    const date = entry.getIn(["data", "date"]);
    const formattedDate = date ? format(new Date(date), "MMMM dd, yyyy") : "";
    
    return (
      <div className="post-preview">
        <h1>{entry.getIn(["data", "title"])}</h1>
        
        <div className="post-meta">
          {formattedDate && <span className="post-date">{formattedDate}</span>}
          {entry.getIn(["data", "author"]) && (
            <span className="post-author">by {entry.getIn(["data", "author"])}</span>
          )}
        </div>
        
        {image && (
          <div className="post-featured-image">
            <img src={image} alt={entry.getIn(["data", "title"])} />
          </div>
        )}
        
        <div className="post-description">
          {entry.getIn(["data", "description"])}
        </div>
        
        <div className="post-body">
          <div dangerouslySetInnerHTML={{ __html: entry.getIn(["data", "body"]) }} />
        </div>
      </div>
    );
  }
}
