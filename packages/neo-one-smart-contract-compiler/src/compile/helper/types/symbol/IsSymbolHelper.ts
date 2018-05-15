import { IsHelper } from '../IsHelper';
import { Types } from '../Types';

// Input: [val]
// Output: [boolean]
export class IsSymbolHelper extends IsHelper {
  protected type = Types.Symbol;
}
