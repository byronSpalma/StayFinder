export type BookingStatus = "pending" | "confirmed" | "cancelled";

// Shape of the data a client sends when creating a booking.
export interface NewBooking {
  booking_id?: string;
  property_id: string;
  guest_name: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  guests: number;
  status?: BookingStatus;
}

// Shape of a booking once it is stored (id and status are always set).
// user_id is set by the server from the verified user, never by the client,
// so it is not part of NewBooking. It is null for old rows without an owner.
export interface Booking extends NewBooking {
  booking_id: string;
  status: BookingStatus;
  user_id: string | null;
}
