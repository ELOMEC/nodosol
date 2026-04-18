export type RootStackParamList = {
  Home: undefined;
  Tip: { creator: string };
  Subscribe: { creator: string; planId: string };
  Ticket: { creator: string; eventId: string };
};
