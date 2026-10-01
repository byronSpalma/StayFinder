export type BookingStatus = "pending" | "confirmed" | "cancelled";

// Shape of the data a client sends when creating a booking.
export interface NewBooking {
  booking_id?: string;
  property_id: string;
  guest_name: string;
  guest_email: string;
  check_in: string;
  check_out: string;
  status?: BookingStatus;
}

// Shape of a booking once it is stored (id and status are always set).
export interface Booking extends NewBooking {
  booking_id: string;
  status: BookingStatus;
}
