// Shape of a property as stored in the properties table / JSON seed data.
export interface Property {
  property_id: string;
  title: string;
  description: string;
  location: string;
  price_per_night: number;
  max_guests: number;
}
