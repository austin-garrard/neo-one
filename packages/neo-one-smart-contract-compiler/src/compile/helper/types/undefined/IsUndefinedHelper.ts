import { IsHelper } from '../IsHelper';
import { Types } from '../Types';

// Input: [val]
// Output: [boolean]
export class IsUndefinedHelper extends IsHelper {
  protected type = Types.Undefined;
}
