// Background tasks must be defined before anything renders — Android can start
// the JS bundle headless (app closed) just to deliver a location update.
import './src/lib/location-task';
import 'expo-router/entry';
