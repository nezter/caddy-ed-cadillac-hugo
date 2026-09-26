import React from "react";

export default class InventoryPreview extends React.Component {
  render() {
    const {entry, getAsset} = this.props;
    const entryVehicles = entry.getIn(["data", "vehicles"]) || [];
    const vehicles = entryVehicles.map(vehicle => ({
      id: vehicle.getIn(["id"]),
      make: vehicle.getIn(["make"]),
      model: vehicle.getIn(["model"]),
      year: vehicle.getIn(["year"]),
      price: vehicle.getIn(["price"]),
      mileage: vehicle.getIn(["mileage"]),
      exteriorColor: vehicle.getIn(["exteriorColor"]),
      interiorColor: vehicle.getIn(["interiorColor"]),
      transmission: vehicle.getIn(["transmission"]),
      vin: vehicle.getIn(["vin"]),
      description: vehicle.getIn(["description"]),
      images: vehicle.getIn(["images"]) || []
    }));

    return (
      <div className="inventory-page">
        <h1>{entry.getIn(["data", "title"])}</h1>
        <div className="intro">
          {entry.getIn(["data", "intro"])}
        </div>
        
        <div className="vehicle-list">
          {vehicles.map((vehicle, index) => (
            <div key={index} className="vehicle-card">
              <div className="vehicle-image">
                {vehicle.images && vehicle.images[0] && (
                  <img src={getAsset(vehicle.images[0]).toString()} alt={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} />
                )}
              </div>
              <div className="vehicle-details">
                <h3>{vehicle.year} {vehicle.make} {vehicle.model}</h3>
                <p className="price">${vehicle.price}</p>
                <p className="specs">{vehicle.mileage} mi | {vehicle.exteriorColor} | {vehicle.transmission}</p>
                <div className="vehicle-actions">
                  <button className="btn">View Details</button>
                  <button className="btn btn-secondary">Schedule Test Drive</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
}
