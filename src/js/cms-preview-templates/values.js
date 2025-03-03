import React from "react";

export default function ValuesPreview({ entry, getAsset }) {
  const data = entry.getIn(["data"]).toJS();
  const image = getAsset(data.image);
  
  return (
    <div>
      <h1>{data.title}</h1>
      {image && <img src={image.toString()} alt={data.title} />}
      <div dangerouslySetInnerHTML={{ __html: data.body }}></div>
      
      {data.values && (
        <div className="values">
          {data.values.map((value, i) => (
            <div key={i} className="value">
              <h3>{value.heading}</h3>
              <p>{value.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
