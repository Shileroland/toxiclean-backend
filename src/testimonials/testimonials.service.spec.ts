import { moved } from './testimonials.service.js';

describe('moved', () => {
  const ids = ['a', 'b', 'c'];

  it('swaps a testimonial with its neighbour', () => {
    expect(moved(ids, 'b', 'up')).toEqual(['b', 'a', 'c']);
    expect(moved(ids, 'b', 'down')).toEqual(['a', 'c', 'b']);
  });

  it('does nothing at either end or for an unknown id', () => {
    expect(moved(ids, 'a', 'up')).toBeNull();
    expect(moved(ids, 'c', 'down')).toBeNull();
    expect(moved(ids, 'x', 'up')).toBeNull();
  });
});
