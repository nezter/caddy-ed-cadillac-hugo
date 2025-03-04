import React from "react";
import format from "date-fns/format";

export default function PostPreview({ entry, getAsset }) {
  const data = entry.getIn(["data"]).toJS();
  const image = data.featured_image && getAsset(data.featured_image);
  
  return (
    <article className="post-preview">
      <header>
        <h1>{data.title}</h1>
        <div className="post-meta">
          <time>{format(new Date(data.date), "MMMM dd, yyyy")}</time>
          {data.author && <span className="author">By {data.author}</span>}
        </div>
      </header>
      
      {image && (
        <div className="featured-image">
          <img src={image} alt={data.title} />
        </div>
      )}
      
      <div className="post-content" dangerouslySetInnerHTML={{ __html: data.body }}>
      </div>
    </article>
  );
}
