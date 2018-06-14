import { IsHelper } from '../IsHelper';
import { Types } from '../Types';

// Input: [val]
// Output: [boolean]
export class IsStringHelper extends IsHelper {
  protected readonly type = Types.String;
}
