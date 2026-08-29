import { ValidationError } from 'class-validator';
import { toValidationFields } from './to-validation-fields';

// class-validator only populates the fields the flattener reads, so build the
// error tree by hand rather than running a real validation pass.
function error(partial: Partial<ValidationError>): ValidationError {
  return partial as ValidationError;
}

describe('toValidationFields', () => {
  it('maps each failed constraint to its own field entry', () => {
    const fields = toValidationFields([
      error({
        property: 'starting_capital',
        constraints: {
          min: 'starting_capital must not be less than 100000',
          isNumber: 'starting_capital must be a number',
        },
      }),
    ]);

    expect(fields).toEqual([
      {
        field: 'starting_capital',
        reason: 'starting_capital must not be less than 100000',
      },
      {
        field: 'starting_capital',
        reason: 'starting_capital must be a number',
      },
    ]);
  });

  it('reports nested failures using a dotted body path', () => {
    const fields = toValidationFields([
      error({
        property: 'order',
        children: [
          error({
            property: 'quantity',
            constraints: { isInt: 'quantity must be an integer' },
          }),
        ],
      }),
    ]);

    expect(fields).toEqual([
      { field: 'order.quantity', reason: 'quantity must be an integer' },
    ]);
  });

  // Regression: a node carrying both its own constraints and children used to
  // report only the children, silently dropping the parent's failure.
  it('keeps a parent constraint alongside its nested failures', () => {
    const fields = toValidationFields([
      error({
        property: 'order',
        constraints: { isObject: 'order must be an object' },
        children: [
          error({
            property: 'quantity',
            constraints: { isInt: 'quantity must be an integer' },
          }),
        ],
      }),
    ]);

    expect(fields).toEqual([
      { field: 'order', reason: 'order must be an object' },
      { field: 'order.quantity', reason: 'quantity must be an integer' },
    ]);
  });

  it('returns nothing for an error tree with no constraints', () => {
    expect(toValidationFields([])).toEqual([]);
    expect(toValidationFields([error({ property: 'name' })])).toEqual([]);
  });
});
