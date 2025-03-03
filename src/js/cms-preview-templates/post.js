import React from "react";
import format from "date-fns/format";

export default function PostPreview({ entry, getAsset }) {
  const data = entry.getIn(["data"]).toJS();
  const image = getAsset(data.image);
  
  return (
    <div className="content">
      <h1>{data.title}</h1>
      <p>Posted: {format(new Date(data.date), "MMMM dd, yyyy")}</p>
      {image && <img src={image.toString()} alt={data.title} />}
      <div dangerouslySetInnerHTML={{ __html: data.body }}></div>
    </div>
  );
}
