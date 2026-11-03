// Fields a client provides when creating or replacing a property.
export interface NewProperty {
  title: string;
  description: string;
  location: string;
  price_per_night: number;
  max_guests: number;
  image_url?: string | null;
}

// Shape of a property as stored in the properties table / JSON seed data.
// owner_id is set by the server from the verified user, never by the client.
// It is null for old rows without an owner.
export interface Property extends NewProperty {
  property_id: string;
  owner_id: string | null;
  image_url: string | null;
}
