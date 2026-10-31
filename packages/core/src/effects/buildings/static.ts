/**
 * Walls: no behaviour. Blocking, HP and flammability come from the building def
 * (`blocking`, `hp`, `flammable`); burning is a world rule handled by the sim.
 */
import { buildingBehaviors } from '../../registry';

buildingBehaviors.register({ id: 'static' });
