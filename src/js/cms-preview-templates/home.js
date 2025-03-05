import React from "react";
import format from "date-fns/format";

import Jumbotron from "./components/jumbotron";

export default class HomePreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    
    // Prepare data from the entry
    const image = getAsset(entry.getIn(["data", "image"]));
    const title = entry.getIn(["data", "title"]);
    const subtitle = entry.getIn(["data", "subtitle"]);
    
    // Get entries for featured vehicles and posts
    const featuredVehicles = entry.getIn(["data", "featured_vehicles"]) || [];
    const latestPosts = entry.getIn(["data", "latest_posts"]) || [];

    return <div>
      <Jumbotron image={image} title={title} subtitle={subtitle} />
      
      <div className="bg-grey-1 pv4">
        <div className="ph3 mw7 center">
          <h2 className="f2 b lh-title mb2">{entry.getIn(["data", "featured_heading"])}</h2>
          <p className="mw6">{entry.getIn(["data", "featured_text"])}</p>
          
          <div className="flex-ns flex-wrap mhn1-ns mb3">
            {featuredVehicles && featuredVehicles.map((vehicle, i) => {
              const vehicleImg = getAsset(vehicle.get("image"));
              return (
                <div className="w-33-ns ph1-ns" key={i}>
                  <div className="relative pb3">
                    <img src={vehicleImg.toString()} alt={vehicle.get("model")} className="db mb2" />
                    <h3>{vehicle.get("model")}</h3>
                    <p>{vehicle.get("year")} - ${vehicle.get("price")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="bg-off-white pv4">
        <div className="ph3 mw7 center">
          <h2 className="f2 b lh-title mb2">{entry.getIn(["data", "blog_heading"])}</h2>
          <p className="mw6">{entry.getIn(["data", "blog_text"])}</p>
          
          <div className="w-100 flex-ns mhn1-ns flex-wrap mb3">
            {latestPosts && latestPosts.map((post, i) => {
              const postImg = getAsset(post.get("image"));
              return (
                <div className="ph1-ns w-50-ns flex" key={i}>
                  <div className="bg-white br1 pa3 mr2 mb2 w-100">
                    <div className="f6 mb2">{format(new Date(post.get("date")), "MMM dd, yyyy")}</div>
                    <h2 className="f3 b lh-title mb1">{post.get("title")}</h2>
                    <img src={postImg.toString()} alt={post.get("title")} className="db mb2" />
                    <p>{post.get("excerpt")}</p>
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